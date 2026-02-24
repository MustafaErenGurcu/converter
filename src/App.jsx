import { useState, useRef } from 'react'
import './App.css'

const MODES = {
  csvToExcel: {
    label: "CSV → Excel",
    title: "CSV'den Excel'e",
    subtitle: "CSV dosyalarınızı temizlenmiş Excel'e dönüştürün",
    accept: ".csv",
    endpoint: "/convert",
    newExt: ".xlsx",
    hint: ".csv dosyaları",
  },
  excelToCsv: {
    label: "Excel → CSV",
    title: "Excel'den CSV'ye",
    subtitle: "Excel dosyalarınızı temizlenmiş CSV'ye dönüştürün",
    accept: ".xlsx,.xls",
    endpoint: "/convert-excel-to-csv",
    newExt: ".csv",
    hint: ".xlsx veya .xls dosyaları",
  },
}

const STATUS_COLOR = {
  pending:    "#aaa",
  processing: "#f0a500",
  done:       "#4caf50",
  error:      "#e53935",
}

const STATUS_LABEL = {
  pending:    "Bekliyor",
  processing: "İşleniyor...",
  done:       "✓ Tamamlandı",
  error:      "✗ Hata",
}

function App() {
  const [mode, setMode] = useState('csvToExcel')
  const [fileList, setFileList] = useState([])
  const inputRef = useRef(null)

  const current = MODES[mode]

  const handleModeChange = (newMode) => {
    setMode(newMode)
    setFileList([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files).map(f => ({
      file: f,
      status: 'pending',
      error: null,
    }))
    setFileList(selected)
  }

  const convertFile = async (item, index) => {
    setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'processing' } : f))

    const formData = new FormData()
    formData.append('file', item.file)

    try {
      const response = await fetch(current.endpoint, { method: 'POST', body: formData })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = item.file.name.replace(/\.[^/.]+$/, '') + current.newExt
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'done' } : f))
      } else {
        const msg = await response.text()
        setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: msg || 'Bilinmeyen hata' } : f))
      }
    } catch {
      setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: 'Sunucuya bağlanılamadı' } : f))
    }
  }

  const handleConvertAll = () => {
    if (fileList.length === 0) return
    fileList.forEach((item, index) => convertFile(item, index))
  }

  const isProcessing = fileList.some(f => f.status === 'processing')
  const doneCount = fileList.filter(f => f.status === 'done').length

  return (
    <div className="container">
      <div className="card">
        <div className="tabs">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              className={`tab ${mode === key ? 'active' : ''}`}
              onClick={() => handleModeChange(key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <h1>{current.title}</h1>
        <p className="subtitle">{current.subtitle}</p>

        <label className="upload-area" htmlFor="file-input">
          <div className="upload-icon">📂</div>
          <p className="upload-text">
            {fileList.length > 0
              ? `${fileList.length} dosya seçildi`
              : 'Dosyaları seçmek için tıklayın'}
          </p>
          <p className="upload-hint">{current.hint} · Çoklu seçim desteklenir</p>
        </label>

        <input
          ref={inputRef}
          id="file-input"
          key={mode}
          type="file"
          accept={current.accept}
          multiple
          onChange={handleFileChange}
          className="file-input"
        />

        {fileList.length > 0 && (
          <div className="file-list">
            {fileList.map((item, i) => (
              <div key={i} className={`file-item ${item.status}`}>
                <span className="file-name">{item.file.name}</span>
                <span
                  className="file-status"
                  style={{ color: STATUS_COLOR[item.status] }}
                  title={item.error || ''}
                >
                  {item.error ? `✗ ${item.error}` : STATUS_LABEL[item.status]}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          className="convert-btn"
          onClick={handleConvertAll}
          disabled={isProcessing || fileList.length === 0}
        >
          {isProcessing
            ? `İşleniyor... (${doneCount}/${fileList.length})`
            : fileList.length > 0
              ? `Dönüştür ve İndir (${fileList.length} dosya)`
              : 'Dönüştür ve İndir'}
        </button>
      </div>
    </div>
  )
}

export default App
