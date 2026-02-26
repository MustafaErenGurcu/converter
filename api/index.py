from flask import Flask, request, send_file
from flask_cors import CORS
import pandas as pd
import csv
import os
import re
import tempfile
import io
import cloudconvert
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
    cloudconvert.configure(api_key=api_key, sandbox=False)

    job = cloudconvert.Job.create(payload={
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
    })

    upload_task = next(t for t in job['tasks'] if t['name'] == 'upload')
    cloudconvert.Task.upload(
        file_name=filename,
        file=io.BytesIO(file_bytes),
        task=upload_task
    )

    job = cloudconvert.Job.wait(id=job['id'])

    export_task = next(t for t in job['tasks'] if t['name'] == 'export')
    file_url = export_task['result']['files'][0]['url']

    response = http_requests.get(file_url)
    return response.content


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
