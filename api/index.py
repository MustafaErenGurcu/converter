from flask import Flask, request, send_file
from flask_cors import CORS
import pandas as pd
import csv
import os
import re
import tempfile
import io
import time
import requests as http_requests

app = Flask(__name__)
CORS(app)


def robust_read_csv(path: str) -> pd.DataFrame:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        sample = f.read(4096)
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        sep = dialect.delimiter
    except Exception:
        sep = ","

    try:
        df = pd.read_csv(path, sep=sep, engine="python", on_bad_lines="skip", dtype=str, encoding="utf-8")
    except UnicodeDecodeError:
        df = pd.read_csv(path, sep=sep, engine="python", on_bad_lines="skip", dtype=str, encoding="latin1")
    return df


def normalize_file(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    content = content.replace(";", ",").replace("\t", ",").replace("Null", "NA").replace("NULL", "NA").replace("null", "NA")
    content = re.sub(r'(?<=\d),(?=\d{3}\b)', '', content)

    temp_path = path + "_normalized.csv"
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(content)
    return temp_path


def cloudconvert_convert(file_bytes, filename, input_fmt, output_fmt):
    api_key = os.environ.get('CLOUDCONVERT_API_KEY', '')
    if not api_key:
        raise Exception("CLOUDCONVERT_API_KEY tanımlı değil")

    headers = {'Authorization': f'Bearer {api_key}'}

    # Job oluştur
    job_resp = http_requests.post(
        'https://api.cloudconvert.com/v2/jobs',
        json={
            'tasks': {
                'upload': {'operation': 'import/upload'},
                'convert': {
                    'operation': 'convert',
                    'input': 'upload',
                    'input_format': input_fmt,
                    'output_format': output_fmt,
                },
                'export': {
                    'operation': 'export/url',
                    'input': 'convert',
                }
            }
        },
        headers=headers
    )
    job_resp.raise_for_status()
    job = job_resp.json()['data']

    # Upload form bilgilerini al
    upload_task = next(t for t in job['tasks'] if t['name'] == 'upload')
    form = upload_task['result']['form']

    # Dosyayı yükle
    params = dict(form['parameters'])
    upload_resp = http_requests.post(
        form['url'],
        data=params,
        files={'file': (filename, io.BytesIO(file_bytes))}
    )
    upload_resp.raise_for_status()

    # Job tamamlanana kadar bekle (max 55 saniye)
    job_id = job['id']
    for _ in range(55):
        poll = http_requests.get(
            f'https://api.cloudconvert.com/v2/jobs/{job_id}',
            headers=headers
        )
        poll.raise_for_status()
        job_data = poll.json()['data']

        if job_data['status'] == 'finished':
            export_task = next(t for t in job_data['tasks'] if t['name'] == 'export')
            file_url = export_task['result']['files'][0]['url']
            return http_requests.get(file_url).content

        if job_data['status'] == 'error':
            failed = next((t for t in job_data['tasks'] if t.get('status') == 'error'), None)
            msg = failed.get('message', 'bilinmeyen hata') if failed else 'job başarısız'
            raise Exception(f"CloudConvert hatası: {msg}")

        time.sleep(1)

    raise Exception("Dönüştürme zaman aşımına uğradı")


@app.route('/convert', methods=['POST'])
def convert_csv_to_excel():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400

    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", dir="/tmp") as temp_input:
        file.save(temp_input.name)
        input_path = temp_input.name

    normalized_path = None
    output_path = None

    try:
        normalized_path = normalize_file(input_path)
        df = robust_read_csv(normalized_path)

        df = df.dropna(how="all")
        df = df.drop_duplicates()
        df.columns = [c.strip() for c in df.columns]
        df = df.apply(lambda x: x.map(lambda y: y.strip() if isinstance(y, str) else y))

        output_path = input_path + ".xlsx"
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Cleaned")

        return send_file(output_path, as_attachment=True, download_name="temizlenmis_dosya.xlsx")

    except Exception as e:
        return str(e), 500
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
        if normalized_path and os.path.exists(normalized_path):
            os.remove(normalized_path)


@app.route('/convert-excel-to-csv', methods=['POST'])
def convert_excel_to_csv():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400

    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", dir="/tmp") as temp_input:
        file.save(temp_input.name)
        input_path = temp_input.name

    output_path = None

    try:
        df = pd.read_excel(input_path, dtype=str)

        df = df.dropna(how="all")
        df = df.drop_duplicates()
        df.columns = [c.strip() for c in df.columns]
        df = df.apply(lambda x: x.map(lambda y: y.strip() if isinstance(y, str) else y))

        output_path = input_path + ".csv"
        df.to_csv(output_path, index=False, encoding="utf-8-sig")

        return send_file(output_path, as_attachment=True, download_name="donusturulmus_dosya.csv")

    except Exception as e:
        return str(e), 500
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)


@app.route('/convert-word-to-pdf', methods=['POST'])
def convert_word_to_pdf():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400

    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    try:
        file_bytes = file.read()
        result = cloudconvert_convert(file_bytes, file.filename, 'docx', 'pdf')
        return send_file(
            io.BytesIO(result),
            as_attachment=True,
            download_name='donusturulmus.pdf',
            mimetype='application/pdf'
        )
    except Exception as e:
        return str(e), 500


@app.route('/convert-pdf-to-word', methods=['POST'])
def convert_pdf_to_word():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400

    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    try:
        file_bytes = file.read()
        result = cloudconvert_convert(file_bytes, file.filename, 'pdf', 'docx')
        return send_file(
            io.BytesIO(result),
            as_attachment=True,
            download_name='donusturulmus.docx',
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    except Exception as e:
        return str(e), 500
