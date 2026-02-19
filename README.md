# Günlük Faiz

Türkiye'deki mevduat ve katılım bankalarının günlük mevduat faiz oranlarını gösteren statik web sitesi.

## Özellikler

- **Faiz Oranları Tablosu**: 36 mevduat + 9 katılım bankası
- **Sıralama & Filtreleme**: Oran, isim, banka türü bazında sıralama ve filtreleme
- **Net Getiri Hesaplayıcı**: Stopaj dahil günlük/aylık/yıllık net getiri hesaplama
- **Banka Karşılaştırma**: 2-4 banka yan yana karşılaştırma
- **Karanlık/Aydınlık Tema**: Sistem temasına uyumlu tema desteği
- **Responsive Tasarım**: Mobil uyumlu arayüz
- **Otomatik Güncelleme**: GitHub Actions ile günlük otomatik veri güncelleme

## Kullanım

Siteyi doğrudan `index.html` dosyasını açarak kullanabilirsiniz. GitHub Pages üzerinde barındırma için:

1. Repository'yi GitHub'a push edin
2. Settings > Pages > Source: "Deploy from a branch" > Branch: `main` > `/` (root)
3. Save

## Scraper

Faiz oranları `scraper/scrape.js` ile otomatik olarak güncellenir:

```bash
cd scraper
npm install puppeteer
cd ..
node scraper/scrape.js
```

GitHub Actions her gün 09:00 (TR saati) otomatik çalışır.

## Proje Yapısı

```
├── index.html          # Ana sayfa
├── css/style.css       # Stiller (responsive + dark/light tema)
├── js/
│   ├── app.js          # Veri yükleme, tablo, sıralama, filtreleme
│   ├── calculator.js   # Net getiri hesaplayıcı
│   ├── comparison.js   # Banka karşılaştırma
│   └── theme.js        # Tema toggle
├── data/rates.json     # Banka faiz oranları verisi
├── scraper/
│   ├── scrape.js       # Puppeteer scraper
│   └── banks.json      # Banka scrape konfigürasyonu
└── .github/workflows/
    └── scrape.yml      # Günlük otomatik scrape
```

## Stopaj

Varsayılan stopaj oranı: **%17,5**. Hesaplayıcıda değiştirilebilir.

## Kaynak

Banka listesi [BDDK](https://www.bddk.org.tr) kaynaklıdır. Veriler bilgi amaçlıdır, yatırım tavsiyesi değildir.
