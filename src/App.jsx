/*
  APP.JSX — Ana Uygulama Bileşeni
  =================================
  Orijinal renk şeması + Lucide ikonları + Drag & Drop + Uçak Animasyonu
  
  UÇAK ANİMASYONU NASIL ÇALIŞIYOR?
  ─────────────────────────────────
  1. useEffect ile bir setInterval kurulur (her 2-4 saniyede bir)
  2. Her interval'de yeni bir "uçak" objesi oluşturulur:
     - Rastgele Y pozisyonu (ekranın %5-%90 arası)
     - Rastgele boyut (16-28px)
     - Rastgele yön (soldan sağa veya sağdan sola)
     - Rastgele uçuş süresi (6-12 saniye)
  3. Uçak DOM'a eklenir, CSS @keyframes ile ekranı geçer
  4. Animasyon bitince (onAnimationEnd) uçak state'ten silinir → bellek temiz kalır
  
  NEDEN state ile yönetiyoruz?
  → React'in sanal DOM'u sayesinde her uçak bir bileşen.
    Direkt DOM manipülasyonu (document.createElement) yerine
    state kullanmak React'in felsefesine uygun ve daha güvenli.
*/

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Combine,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
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
    icon: FileSpreadsheet,
  },
  excelToCsv: {
    label: "Excel → CSV",
    title: "Excel'den CSV'ye",
    subtitle: "Excel dosyalarınızı temizlenmiş CSV'ye dönüştürün",
    accept: ".xlsx,.xls",
    endpoint: "/convert-excel-to-csv",
    newExt: ".csv",
    hint: ".xlsx veya .xls dosyaları",
    icon: FileSpreadsheet,
  },
  wordToPdf: {
    label: "Word → PDF",
    title: "Word'den PDF'e",
    subtitle: "Word dosyalarınızı PDF formatına dönüştürün",
    accept: ".docx",
    endpoint: "/convert-word-to-pdf",
    newExt: ".pdf",
    hint: ".docx dosyaları",
    icon: FileText,
  },
  pdfToWord: {
    label: "PDF → Word",
    title: "PDF'den Word'e",
    subtitle: "PDF dosyalarınızı düzenlenebilir Word formatına dönüştürün",
    accept: ".pdf",
    endpoint: "/convert-pdf-to-word",
    newExt: ".docx",
    hint: ".pdf dosyaları",
    icon: FileText,
  },
  mergePdf: {
    label: "PDF Birleştir",
    title: "PDF Birleştirme",
    subtitle: "Birden fazla PDF dosyasını tek bir dosyada birleştirin",
    accept: ".pdf",
    endpoint: "/merge-pdf",
    hint: ".pdf dosyaları · En az 2 dosya seçin",
    isMerge: true,
    icon: Combine,
  },
}

/*
  YAN BAKIŞ UÇAK SVG BİLEŞENİ
  ────────────────────────────
  NEDEN özel SVG? Lucide'ın Plane ikonu kuş bakışı (üstten) görünüm.
  Kullanıcı yan bakış (profil) istiyor — bu yüzden kendi SVG'mizi çizdik.
  
  SVG sağa bakıyor (burun sağda). Sola giden uçaklar için CSS'te
  scaleX(-1) ile yatay aynalama yapıyoruz.
  
  Parçalar:
  - Gövde (fuselage): Uzun silindirik ana gövde
  - Kuyruk (tail fin): Arkadaki dikey kanatçık
  - Ana kanat (wing): Geriye eğimli (swept-back) büyük kanat
  - Kuyruk: Arkada yukarı çıkan fin + küçük yatay stabilizer
  
  Tek path ile temiz silüet → içi tamamen dolu (filled) görünüm.
*/
const SideAirplane = ({ size = 24 }) => (
  <svg
    width={size}
    height={size * 0.55}
    viewBox="0 0 80 44"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Ana gövde + burun — sivri burunlu, yuvarlak gövde */}
    <path d="M78,22 C78,19 76,17 72,16 L18,16 C12,16 6,18 2,20 L0,22 L2,24 C6,26 12,28 18,28 L72,28 C76,27 78,25 78,22 Z" />
    {/* Ana kanat — geriye eğimli (swept-back), referans görseldeki gibi */}
    <path d="M38,16 L22,4 L18,4 L20,8 L30,16 Z" />
    <path d="M40,28 L24,38 L20,38 L22,34 L32,28 Z" />
    {/* Kuyruk kanatçığı (tail fin) — belirgin, yukarı çıkan */}
    <path d="M14,16 L6,2 L2,2 L4,8 L10,16 Z" />
    {/* Kuyruk yatay stabilizer */}
    <path d="M12,28 L6,34 L3,34 L5,30 L10,28 Z" />
  </svg>
)

/*
  BULUT SVG BİLEŞENİ
  ───────────────────
  NEDEN özel SVG? Bulut şekli organik olmalı — hazır ikon kütüphanelerinin
  bulutları çok "düz" ve "ikonumsu" kalıyor.
  
  NASIL? Birden fazla daire (circle) üst üste bindirerek
  doğal bulut silüeti oluşturuyoruz. Bu yaygın bir teknik:
  kabarık bulut = overlapping circles.
  
  fill="currentColor" → renk CSS'ten (color property) miras alınır.
  opacity farklı daireler arasında hafif değişerek derinlik katar.
*/
const Cloud = ({ width = 120 }) => (
  <svg
    width={width}
    height={width * 0.45}
    viewBox="0 0 120 54"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Alt taban — geniş yatay elips */}
    <ellipse cx="60" cy="40" rx="50" ry="12" opacity="0.6" />
    {/* Sol kabarıklık */}
    <circle cx="30" cy="32" r="18" opacity="0.7" />
    {/* Orta-sol kabarıklık */}
    <circle cx="50" cy="24" r="22" opacity="0.8" />
    {/* Orta-sağ kabarıklık (en yüksek nokta) */}
    <circle cx="72" cy="22" r="20" opacity="0.85" />
    {/* Sağ kabarıklık */}
    <circle cx="90" cy="30" r="16" opacity="0.7" />
    {/* Üst detay — küçük ek kabarıklık */}
    <circle cx="58" cy="16" r="14" opacity="0.5" />
  </svg>
)

/*
  UÇAK SPAWN HOOK'U
  ──────────────────
  Kendi custom hook'umuz. Uçakları bağımsız bir mantık olarak ayırıyoruz
  çünkü bu, dosya dönüştürme mantığından tamamen bağımsız — ayrı tutmak
  kodun okunurluğunu artırır (Separation of Concerns).
  
  useCallback ile spawnAirplane fonksiyonunu memoize ediyoruz —
  bu sayede her render'da yeni fonksiyon oluşturulmaz.
*/
function useAirplanes() {
  const [airplanes, setAirplanes] = useState([])
  const idCounter = useRef(0)

  const spawnAirplane = useCallback(() => {
    const id = idCounter.current++
    const direction = Math.random() > 0.5 ? 'fly-right' : 'fly-left'
    const top = 5 + Math.random() * 85          // Ekranın %5-%90 arası
    const size = 20 + Math.random() * 16         // 20-36px arası (yan profil daha büyük olmalı)
    const duration = 6 + Math.random() * 6       // 6-12 saniye

    setAirplanes(prev => [...prev, { id, direction, top, size, duration }])
  }, [])

  const removeAirplane = useCallback((id) => {
    setAirplanes(prev => prev.filter(a => a.id !== id))
  }, [])

  useEffect(() => {
    /*
      İlk birkaç uçağı hemen spawn et — sayfa açıldığında
      boş bir ekran yerine birkaç uçak görünsün.
    */
    const initialDelay1 = setTimeout(() => spawnAirplane(), 500)
    const initialDelay2 = setTimeout(() => spawnAirplane(), 1500)

    /*
      Sonra rastgele aralıklarla yeni uçak spawn et.
      setInterval yerine recursive setTimeout kullanıyoruz
      çünkü her spawn'dan sonra FARKLI bir bekleme süresi istiyoruz.
      setInterval her zaman aynı süreyi bekler — bu monoton görünür.
    */
    let timeoutId
    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 3000  // 2-5 saniye arası rastgele
      timeoutId = setTimeout(() => {
        spawnAirplane()
        scheduleNext() // Bir sonrakini planla
      }, delay)
    }
    scheduleNext()

    return () => {
      clearTimeout(initialDelay1)
      clearTimeout(initialDelay2)
      clearTimeout(timeoutId)
    }
  }, [spawnAirplane])

  return { airplanes, removeAirplane }
}

/*
  BULUT SPAWN HOOK'U
  ──────────────────
  Uçak hook'uyla aynı pattern, farklı parametreler:
  - Konum: Sadece üst kısım (%3-%30) → gökyüzü hissi
  - Boyut: 80-180px → bulutlar uçaklardan çok daha büyük
  - Hız: 15-30 saniye → uçaklardan çok daha yavaş (rüzgarda süzülme)
  - Spawn sıklığı: 4-8 saniye → daha seyrek (gökyüzü kalabalık olmasın)
  - Yön: Çoğunlukla sağa (%70) → rüzgar etkisi
*/
function useClouds() {
  const [clouds, setClouds] = useState([])
  const idCounter = useRef(0)

  const spawnCloud = useCallback(() => {
    const id = idCounter.current++
    const direction = Math.random() > 0.3 ? 'drift-right' : 'drift-left'
    const top = 3 + Math.random() * 27           // Ekranın üst %3-%30 arası
    const width = 80 + Math.random() * 100        // 80-180px genişlik
    const duration = 15 + Math.random() * 15      // 15-30 saniye (yavaş drift)

    setClouds(prev => [...prev, { id, direction, top, width, duration }])
  }, [])

  const removeCloud = useCallback((id) => {
    setClouds(prev => prev.filter(c => c.id !== id))
  }, [])

  useEffect(() => {
    // Sayfa açılınca 1-2 bulut hemen görünsün
    const init1 = setTimeout(() => spawnCloud(), 300)
    const init2 = setTimeout(() => spawnCloud(), 2000)

    let timeoutId
    const scheduleNext = () => {
      const delay = 4000 + Math.random() * 4000  // 4-8 saniye arası
      timeoutId = setTimeout(() => {
        spawnCloud()
        scheduleNext()
      }, delay)
    }
    scheduleNext()

    return () => {
      clearTimeout(init1)
      clearTimeout(init2)
      clearTimeout(timeoutId)
    }
  }, [spawnCloud])

  return { clouds, removeCloud }
}

function App() {
  const [mode, setMode] = useState('csvToExcel')
  const [fileList, setFileList] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)
  const dragCounter = useRef(0)

  // Animasyon hook'ları
  const { airplanes, removeAirplane } = useAirplanes()
  const { clouds, removeCloud } = useClouds()

  const current = MODES[mode]

  const handleModeChange = (newMode) => {
    setMode(newMode)
    setFileList([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const processFiles = (files) => {
    const selected = Array.from(files).map(f => ({
      file: f,
      status: 'pending',
      error: null,
    }))
    if (current.isMerge) {
      setFileList(prev => [...prev, ...selected])
    } else {
      setFileList(selected)
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFileChange = (e) => {
    processFiles(e.target.files)
  }

  // Drag & Drop
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) setIsDragging(true)
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0
    if (e.dataTransfer.files?.length > 0) processFiles(e.dataTransfer.files)
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

  const handleMerge = async () => {
    setFileList(prev => prev.map(f => ({ ...f, status: 'processing' })))
    const formData = new FormData()
    fileList.forEach(item => formData.append('files', item.file))
    try {
      const response = await fetch(current.endpoint, { method: 'POST', body: formData })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'birlestirilmis.pdf'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        setFileList(prev => prev.map(f => ({ ...f, status: 'done' })))
      } else {
        const msg = await response.text()
        setFileList(prev => prev.map(f => ({ ...f, status: 'error', error: msg || 'Bilinmeyen hata' })))
      }
    } catch {
      setFileList(prev => prev.map(f => ({ ...f, status: 'error', error: 'Sunucuya bağlanılamadı' })))
    }
  }

  const handleRemoveFile = (index) => setFileList(prev => prev.filter((_, i) => i !== index))

  const handleMoveUp = (index) => {
    if (index === 0) return
    setFileList(prev => {
      const next = [...prev]
        ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  const handleMoveDown = (index) => {
    setFileList(prev => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
        ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  const handleConvertAll = () => {
    if (current.isMerge) {
      handleMerge()
    } else {
      if (fileList.length === 0) return
      fileList.forEach((item, index) => convertFile(item, index))
    }
  }

  const isProcessing = fileList.some(f => f.status === 'processing')
  const isMergeReady = current.isMerge && fileList.length >= 2

  const renderStatusIcon = (status) => {
    switch (status) {
      case 'processing': return <Loader2 size={14} className="status-spinner" />
      case 'done': return <CheckCircle2 size={14} color="#22c55e" />
      case 'error': return <XCircle size={14} color="#ef4444" />
      default: return null
    }
  }

  const STATUS_LABEL = {
    pending: "Bekliyor",
    processing: "İşleniyor...",
    done: "Tamamlandı",
    error: "Hata",
  }

  return (
    <>
      {/* ─── UÇAK KATMANI ───
          Kartın ALTINDA, tam ekran kaplayan sabit (fixed) bir katman.
          pointer-events: none → uçaklara tıklanmaz, alttaki kart tıklanabilir kalır.
          z-index: 0 → kart z-index: 2 olduğu için altında kalır.
          
          Her uçak:
          - top: rastgele Y pozisyonu (vh birimi)
          - style.--fly-duration: CSS variable olarak animasyon süresi
          - onAnimationEnd: animasyon bitince state'ten silinir (bellek temizliği)
      */}
      <div className="airplane-layer">
        {/* ─── BULUTLAR ───
            Uçaklardan ÖNCE render ediliyor → z-order'da altta kalır.
            Bulutlar gökyüzünün arka planı, uçaklar ön planda.
            color: #c0c0c0 → gri ton (kırmızı değil, doğal bulut rengi)
        */}
        {clouds.map(cloud => (
          <div
            key={`cloud-${cloud.id}`}
            className={`cloud ${cloud.direction}`}
            style={{
              top: `${cloud.top}%`,
              '--drift-duration': `${cloud.duration}s`,
              color: '#c8c8c8',
            }}
            onAnimationEnd={() => removeCloud(cloud.id)}
          >
            <Cloud width={cloud.width} />
          </div>
        ))}

        {/* ─── UÇAKLAR ─── */}
        {airplanes.map(plane => (
          <div
            key={plane.id}
            className={`airplane ${plane.direction}`}
            style={{
              top: `${plane.top}%`,
              '--fly-duration': `${plane.duration}s`,
            }}
            onAnimationEnd={() => removeAirplane(plane.id)}
          >
            <SideAirplane size={plane.size} />
          </div>
        ))}
      </div>

      <div className="container">
        <div className="card">
          <div className="tabs">
            {Object.entries(MODES).map(([key, m]) => {
              const TabIcon = m.icon
              return (
                <button
                  key={key}
                  className={`tab ${mode === key ? 'active' : ''}`}
                  onClick={() => handleModeChange(key)}
                >
                  <TabIcon size={14} className="tab-icon" />
                  {m.label}
                </button>
              )
            })}
          </div>

          <div className="mode-header">
            <h1>{current.title}</h1>
            <p className="subtitle">{current.subtitle}</p>
          </div>

          <label
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            htmlFor="file-input"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="upload-icon">
              <Upload size={36} strokeWidth={1.5} />
            </div>
            <p className="upload-text">
              {isDragging
                ? 'Dosyaları buraya bırakın'
                : fileList.length > 0
                  ? `${fileList.length} dosya seçildi`
                  : 'Dosyaları sürükleyin veya tıklayın'}
            </p>
            <p className="upload-hint">
              {current.hint}
              {current.isMerge ? ' · Her seferde dosya ekleyebilirsiniz' : ' · Çoklu seçim desteklenir'}
            </p>
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
                  {current.isMerge && !isProcessing && (
                    <div className="file-order-btns">
                      <button className="file-btn" onClick={() => handleMoveUp(i)} disabled={i === 0} title="Yukarı taşı">↑</button>
                      <button className="file-btn" onClick={() => handleMoveDown(i)} disabled={i === fileList.length - 1} title="Aşağı taşı">↓</button>
                    </div>
                  )}
                  <span className="file-name">{item.file.name}</span>
                  <span className="file-status">
                    {renderStatusIcon(item.status)}
                    {item.error ? item.error : STATUS_LABEL[item.status]}
                  </span>
                  {!isProcessing && (
                    <button className="file-btn file-btn-remove" onClick={() => handleRemoveFile(i)} title="Kaldır">×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            className="convert-btn"
            onClick={handleConvertAll}
            disabled={isProcessing || fileList.length === 0 || (current.isMerge && fileList.length < 2)}
          >
            {isProcessing
              ? 'İşleniyor...'
              : current.isMerge
                ? isMergeReady
                  ? `Birleştir ve İndir (${fileList.length} dosya)`
                  : fileList.length === 1
                    ? 'En az 2 dosya seçin'
                    : 'Birleştir ve İndir'
                : fileList.length > 0
                  ? `Dönüştür ve İndir (${fileList.length} dosya)`
                  : 'Dönüştür ve İndir'}
          </button>
        </div>
      </div>
    </>
  )
}

export default App
