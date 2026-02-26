from flask import Flask, request, send_file
from flask_cors import CORS
import pandas as pd
import csv
import os
import re
import tempfile
import shutil
import subprocess
from pdf2docx import Converter as PdfToDocxConverter

app = Flask(__name__)
CORS(app)  # React uygulamasının buraya erişmesine izin ver

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

    
    content = content.replace(";", ",").replace("\t", ",").replace("Null","NA").replace("NULL","NA").replace("null","NA")
    
    content = re.sub(r'(?<=\d),(?=\d{3}\b)', '', content)

    temp_path = path + "_normalized.csv"
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(content)
    return temp_path

@app.route('/convert', methods=['POST'])
def convert_csv_to_excel():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400
    
    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    # Geçici dosya oluştur
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as temp_input:
        file.save(temp_input.name)
        input_path = temp_input.name

    normalized_path = None
    output_path = None

    try:
        # 1. Dosyayı normalize et
        normalized_path = normalize_file(input_path)
        
        # 2. DataFrame'e oku
        df = robust_read_csv(normalized_path)

        # 3. Pandas temizlikleri
        df = df.dropna(how="all")
        df = df.drop_duplicates()
        # Kolon adlarındaki boşlukları temizle
        df.columns = [c.strip() for c in df.columns]
        # Hücre içindeki boşlukları temizle
        df = df.apply(lambda x: x.map(lambda y: y.strip() if isinstance(y, str) else y))

        # 4. Excel'e kaydet
        output_path = input_path + ".xlsx"
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Cleaned")

        # 5. Dosyayı geri gönder
        return send_file(output_path, as_attachment=True, download_name="temizlenmis_dosya.xlsx")

    except Exception as e:
        return str(e), 500
    finally:
        # Temizlik: Geçici dosyaları sil (output_path hariç, o gönderiliyor)
        if os.path.exists(input_path): os.remove(input_path)
        if normalized_path and os.path.exists(normalized_path): os.remove(normalized_path)

@app.route('/convert-excel-to-csv', methods=['POST'])
def convert_excel_to_csv():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400

    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as temp_input:
        file.save(temp_input.name)
        input_path = temp_input.name

    output_path = None

    try:
        df = pd.read_excel(input_path, dtype=str)

        # Temizlikler
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


def find_libreoffice():
    for cmd in ['libreoffice', 'soffice']:
        if shutil.which(cmd):
            return cmd
    mac_path = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    if os.path.exists(mac_path):
        return mac_path
    for win_path in [
        r'C:\Program Files\LibreOffice\program\soffice.exe',
        r'C:\Program Files (x86)\LibreOffice\program\soffice.exe',
    ]:
        if os.path.exists(win_path):
            return win_path
    return None


@app.route('/convert-word-to-pdf', methods=['POST'])
def convert_word_to_pdf():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400

    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    soffice = find_libreoffice()
    if not soffice:
        return "LibreOffice kurulu değil. Lütfen LibreOffice'i kurun.", 500

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_input:
        file.save(temp_input.name)
        input_path = temp_input.name

    output_dir = tempfile.mkdtemp()
    output_path = None

    try:
        result = subprocess.run(
            [soffice, '--headless', '--convert-to', 'pdf', '--outdir', output_dir, input_path],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            return f"Dönüştürme hatası: {result.stderr}", 500

        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(output_dir, base_name + '.pdf')

        if not os.path.exists(output_path):
            return "PDF dosyası oluşturulamadı", 500

        return send_file(output_path, as_attachment=True, download_name="donusturulmus.pdf")
    except subprocess.TimeoutExpired:
        return "Dönüştürme zaman aşımına uğradı", 500
    except Exception as e:
        return str(e), 500
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)


@app.route('/convert-pdf-to-word', methods=['POST'])
def convert_pdf_to_word():
    if 'file' not in request.files:
        return "Dosya yüklenmedi", 400

    file = request.files['file']
    if file.filename == '':
        return "Dosya seçilmedi", 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_input:
        file.save(temp_input.name)
        input_path = temp_input.name

    output_path = input_path.replace(".pdf", ".docx")

    try:
        cv = PdfToDocxConverter(input_path)
        cv.convert(output_path)
        cv.close()
        return send_file(output_path, as_attachment=True, download_name="donusturulmus.docx")
    except Exception as e:
        return str(e), 500
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=False, host='0.0.0.0', port=port)
