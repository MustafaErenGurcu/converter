/*
  AIRPLANE INTRO — Uçaklı Geçiş Animasyonu
  ==========================================
  Temiz, minimalist giriş ekranı:
  - Ortada sadece "InternWorks" yazısı (elegant tipografi)
  - Aşağı kaydırınca bir uçak ekrandan geçer
  - Uçak geçerken sahne değişir → ana uygulamaya geçiş

  NASIL ÇALIŞIYOR?
  ─────────────────
  1. 300vh scroll alanı ile yeterli mesafe sağlanır
  2. progress 0: Temiz hero ekranı — sadece başlık
  3. progress 0-0.5: Başlık fade out + yukarı kayma
  4. progress 0.2-0.7: Uçak soldan sağa uçar (Bézier eğrisi)
  5. progress 0.3-1.0: Ana uygulama fade in + scale up
  6. Yukarı scroll → her şey geri sarılır
*/

import { useState, useEffect, useRef } from 'react'
import './EnvelopeIntro.css'

/* ─── YAN BAKIŞ UÇAK SVG (büyük versiyon) ─── */
function IntroAirplane({ progress }) {
    // Uçak yolu: sol dışından → sağ dışına (Bézier eğrisi)
    // progress 0 → x: -20%, y: 60%
    // progress 0.5 → x: 50%, y: 30% (yukarı doğru)
    // progress 1 → x: 120%, y: 50%
    const t = Math.max(0, Math.min(1, (progress - 0.12) / 0.55))

    // Bezier eğrisi ile uçak pozisyonu
    const x = -20 + t * 140     // -20% → 120%
    // Yukarı kavis yapıp iniyor
    const y = 55 - Math.sin(t * Math.PI) * 30   // 55% → 25% → 55%

    // Uçak eğimi (yükselirken yukarı, inerken aşağı)
    const angle = -Math.cos(t * Math.PI) * 15    // -15° → +15°

    // Uçak boyutu
    const scale = 0.8 + Math.sin(t * Math.PI) * 0.4  // ortada büyür

    // Görünürlük
    const opacity = t > 0 && t < 1 ? 1 : 0

    return (
        <div
            className="intro-airplane"
            style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) rotate(${angle}deg) scale(${scale})`,
                opacity,
            }}
        >
            {/* Uçak iz çizgisi (trail) */}
            <div className="airplane-trail" />
            {/* Uçak SVG */}
            <svg
                width="120"
                height="66"
                viewBox="0 0 100 55"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                className="airplane-svg"
            >
                <path d="M96,24 C99,24 100,26.5 100,28 C100,29.5 99,32 96,32 L22,33 C15,33.5 9,32.5 5,31 C2,29.5 2,26.5 5,25 C9,23.5 15,22.5 22,23 Z" />
                <path d="M60,33 C52,39 42,47 34,51 L26,51 C30,47 38,39 46,33 Z" />
                <path d="M56,23 C48,17 40,9 34,5 L28,5 C32,9 38,17 46,23 Z" />
                <path d="M16,23 C12,17 8,9 6,4 L2,4 C4,9 8,17 12,23 Z" />
                <path d="M14,33 C10,37 7,41 4,43 L2,41 C5,39 8,35 10,33 Z" />
            </svg>
        </div>
    )
}

export default function EnvelopeIntro({ children }) {
    const [progress, setProgress] = useState(0)
    const containerRef = useRef(null)

    useEffect(() => {
        const handleScroll = () => {
            if (!containerRef.current) return

            const rect = containerRef.current.getBoundingClientRect()
            const scrollableDistance = containerRef.current.offsetHeight - window.innerHeight

            if (scrollableDistance <= 0) {
                setProgress(0)
                return
            }

            const scrolled = -rect.top
            const p = Math.max(0, Math.min(1, scrolled / scrollableDistance))
            setProgress(p)
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll()

        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // ══════ ANİMASYON HESAPLAMALARI ══════

    // Başlık: fade out + yukarı kayma (ilk %50)
    const titleOpacity = Math.max(0, 1 - progress / 0.4)
    const titleY = progress * -80
    const titleScale = 1 - progress * 0.1

    // Alt çizgi: fade out
    const lineOpacity = Math.max(0, 1 - progress / 0.35)

    // Scroll hint: hemen kaybol
    const hintOpacity = Math.max(0, 1 - progress / 0.1)

    // Arka plan geçişi: koyu → açık
    // progress 0.3-0.7 arası geçiş
    const bgTransition = Math.max(0, Math.min(1, (progress - 0.25) / 0.45))

    // İçerik: reveal efekti (progress 0.4'ten sonra)
    const contentProgress = Math.max(0, (progress - 0.35) / 0.5)
    const contentOpacity = Math.min(1, contentProgress)
    const contentScale = 0.9 + Math.min(1, contentProgress) * 0.1

    // Pointer events
    const isRevealed = progress > 0.85

    return (
        <div className="intro-wrapper">
            <div className="intro-scroll-spacer" ref={containerRef}>
                <div className="intro-stage">

                    {/* ═══ ARKA PLAN GEÇİŞİ ═══ */}
                    <div
                        className="intro-bg-dark"
                        style={{ opacity: 1 - bgTransition }}
                    />
                    <div
                        className="intro-bg-light"
                        style={{ opacity: bgTransition }}
                    />

                    {/* ═══ HERO BAŞLIK ═══ */}
                    <div
                        className="intro-hero"
                        style={{
                            opacity: titleOpacity,
                            transform: `translateY(${titleY}px) scale(${titleScale})`,
                        }}
                    >
                        <h1 className="intro-title">
                            <span className="intro-title-intern">Intern</span>
                            <span className="intro-title-works">Works</span>
                        </h1>
                        <div className="intro-line" style={{ opacity: lineOpacity }} />
                        <p className="intro-tagline" style={{ opacity: lineOpacity }}>
                            Dosya dönüştürme, hızlı ve kolay
                        </p>
                    </div>

                    {/* ═══ UÇAK ═══ */}
                    <IntroAirplane progress={progress} />

                    {/* ═══ ANA UYGULAMA İÇERİĞİ ═══ */}
                    <div
                        className="intro-content-reveal"
                        style={{
                            opacity: contentOpacity,
                            transform: `scale(${contentScale})`,
                            pointerEvents: isRevealed ? 'auto' : 'none',
                        }}
                    >
                        {children}
                    </div>

                    {/* ═══ SCROLL İPUCU ═══ */}
                    <div className="intro-scroll-hint" style={{ opacity: hintOpacity }}>
                        <div className="scroll-line" />
                    </div>
                </div>
            </div>
        </div>
    )
}
