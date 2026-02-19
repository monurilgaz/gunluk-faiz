#!/usr/bin/env node
// Node.js scraper for GitHub Actions
// Fetches bank interest rates and writes data/rates.json

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TIMEOUT = 20000;

// ===== HTTP Helpers =====

function request(url, opts = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === 'https:' ? https : http;
        const timer = setTimeout(() => { reject(new Error('Timeout')); }, TIMEOUT);
        const reqOpts = {
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method: opts.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                ...(opts.headers || {})
            }
        };
        if (opts.body) {
            reqOpts.headers['Content-Length'] = Buffer.byteLength(opts.body);
        }
        const req = mod.request(reqOpts, res => {
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                clearTimeout(timer);
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
            });
        });
        req.on('error', e => { clearTimeout(timer); reject(e); });
        req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('Timeout')); });
        if (opts.body) req.write(opts.body);
        req.end();
    });
}

async function fetchHTML(url) {
    const res = await request(url);
    return new JSDOM(res.body).window.document;
}

async function fetchJSON(url, body, contentType) {
    const res = await request(url, {
        method: 'POST',
        headers: {
            'Content-Type': contentType || 'application/json; charset=utf-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': new URL(url).origin,
            'Referer': new URL(url).origin + '/'
        },
        body: body
    });
    return JSON.parse(res.body);
}

async function fetchGETJSON(url) {
    const res = await request(url, {
        headers: { 'Accept': 'application/json, */*' }
    });
    return JSON.parse(res.body);
}

// ===== Parse Helpers =====

function parseNumber(str) {
    if (!str) return 0;
    str = str.replace(/[^\d,.]/g, '');
    if (!str) return 0;
    const cp = str.split(',');
    if (cp.length === 2) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else {
        const dp = str.split('.');
        if (dp.length === 2 && dp[1].length <= 2) { /* keep */ }
        else { str = str.replace(/\./g, ''); }
    }
    return parseFloat(str) || 0;
}

function parseRate(str) {
    if (!str) return 0;
    return parseNumber(str.replace(/<[^>]*>/g, '').trim().replace('%', '').trim());
}

function parseRange(str) {
    if (!str) return null;
    str = str.replace(/<[^>]*>/g, '').trim().replace(/TL/gi, '').trim();
    const mOpen = str.match(/([\d.,]+)\s*[-–]?\s*(?:ve\s+)?[üu]zeri/i);
    if (mOpen) return { min: parseNumber(mOpen[1]), max: null };
    const m = str.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)/);
    if (!m) return null;
    return { min: parseNumber(m[1]), max: parseNumber(m[2]) };
}

// ===== API Parsers =====

const apiParsers = {
    akbank: async (b) => {
        const data = await fetchJSON(b.apiUrl, JSON.stringify({ dovizKodu: 888, faizTipi: 20, faizTuru: 0, kanalKodu: 72 }));
        const svc = data?.d?.Data;
        if (!svc?.ServiceData) return null;
        const headers = svc.ServiceData.Headers;
        const grossRates = svc.ServiceData.GrossRates;
        if (!headers || !grossRates?.length) return null;
        const rates = grossRates[0].GRates;
        if (!rates || rates.length !== headers.length) return null;
        let nibPct = 0;
        const nm = (svc.Description || '').match(/%(\d+)/);
        if (nm) nibPct = parseInt(nm[1]);
        const tiers = [];
        for (let i = 0; i < headers.length; i++) {
            const range = parseRange(headers[i]);
            if (!range) continue;
            const rate = parseRate(rates[i].Rate);
            if (rate <= 0) continue;
            const tier = { min: range.min, max: range.max, annualRate: rate, nib: 0 };
            if (nibPct > 0) tier.nibPercentage = nibPct;
            tiers.push(tier);
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    'is-bankasi': async (b) => {
        const data = await fetchGETJSON(b.apiUrl);
        if (!data?.Data?.length) return null;
        const tiers = [];
        for (const item of data.Data) {
            const rangeStr = item.PriceRange || '';
            const rateVal = parseFloat((item.RateValue || '0').replace(/,/g, '')) || 0;
            if (rateVal <= 0) continue;
            const oe = rangeStr.match(/([\d,]+\.?\d*)\s*\+/);
            if (oe) {
                tiers.push({ min: parseFloat(oe[1].replace(/,/g, '')) || 0, max: null, annualRate: rateVal, nib: 0 });
            } else {
                const p = rangeStr.match(/([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)/);
                if (p) tiers.push({ min: parseFloat(p[1].replace(/,/g, '')) || 0, max: parseFloat(p[2].replace(/,/g, '')) || 0, annualRate: rateVal, nib: 0 });
            }
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    hsbc: async (b) => {
        const data = await fetchGETJSON(b.apiUrl);
        if (!data?.RawJson) return null;
        const inner = JSON.parse(data.RawJson);
        const table = inner?.GenericTable?.Data;
        if (!table?.Rows?.Row) return null;
        const tiers = [];
        for (const row of table.Rows.Row) {
            const cols = row.Column;
            if (!cols || cols.length < 3) continue;
            const v0 = (cols[0].Value || '').trim();
            if (/^(TL|USD|EUR|GBP|CHF|XAU|XAG)$/i.test(v0)) continue;
            if (v0.indexOf('TL') < 0) continue;
            const range = parseRange(v0);
            if (!range) continue;
            const nib = parseNumber(cols[1].Value);
            const rate = parseRate(cols[2].Value);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    halkbank: async (b) => {
        const data = await fetchJSON(b.apiUrl, JSON.stringify({ interestType: '2', currCode: 9000 }));
        if (!data?.data) return null;
        const d = data.data;
        const ranges = d.amountRangeList;
        const details = d.rateDetails;
        if (!ranges || !details?.length) return null;
        let dayRate = null;
        for (const r of details) {
            if (r.minMaturity === 1 && r.maxMaturity === 1) { dayRate = r; break; }
        }
        if (!dayRate?.amountRateList) return null;
        const tiers = [];
        for (let i = 0; i < ranges.length; i++) {
            const range = parseRange(ranges[i]);
            if (!range) continue;
            const rate = parseNumber(dayRate.amountRateList[i].rate);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib: 0 });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    teb: async (b) => {
        const data = await fetchJSON(b.apiUrl, 'paraKod=TL&ceptetebEH=E', 'application/x-www-form-urlencoded; charset=UTF-8');
        if (!data || !Array.isArray(data)) return null;
        const tiers = [];
        for (const item of data) {
            const rate = item.hosgeldinOran || item.tabelaOran || 0;
            if (rate <= 0) continue;
            tiers.push({ min: item.altLimit || 0, max: item.ustLimit || null, annualRate: rate, nib: item.vadesizBakiye || 0 });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    'garanti-bbva': async (b) => {
        const data = await fetchJSON(b.apiUrl, '{}');
        if (!data?.content) return null;
        const doc = new JSDOM(data.content).window.document;
        const table = doc.querySelector('table.contentGrid') || doc.querySelector('table');
        if (!table) return null;
        const ths = table.querySelectorAll('thead th');
        if (!ths || ths.length < 2) return null;
        const ranges = [];
        for (let h = 1; h < ths.length; h++) {
            const t = ths[h].textContent.trim();
            const om = t.match(/([\d.,]+)\s*\+/);
            if (om) ranges.push({ min: parseNumber(om[1]), max: null });
            else ranges.push(parseRange(t));
        }
        const firstRow = table.querySelector('tbody tr');
        if (!firstRow) return null;
        const cells = firstRow.querySelectorAll('td');
        const tiers = [];
        for (let c = 0; c < cells.length && c < ranges.length; c++) {
            const range = ranges[c];
            if (!range) continue;
            const rate = parseRate(cells[c].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib: 0 });
        }
        return tiers.length > 0 ? { tiers } : null;
    }
};

// ===== HTML Parsers =====

const htmlParsers = {
    ing: (doc) => {
        const table = doc.querySelector('table.ui-tables');
        if (!table) return null;
        const tiers = [];
        for (const row of table.querySelectorAll('tr')) {
            if (row.classList.contains('table-header')) continue;
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) continue;
            const vals = Array.from(cells).map(c => {
                const v = c.querySelector('div.value');
                return v ? v.textContent.trim() : c.textContent.trim();
            });
            const range = parseRange(vals[0]);
            if (!range) continue;
            const nib = parseNumber(vals[1]);
            const rate = parseRate(vals[2]);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    denizbank: (doc) => {
        const table = doc.querySelector('#tab1 table.blueTable') || doc.querySelector('table.blueTable');
        if (!table) return null;
        const tiers = [];
        for (const row of table.querySelectorAll('tbody tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) continue;
            const range = parseRange(cells[0].textContent);
            if (!range) continue;
            const nib = parseNumber(cells[1].textContent);
            const rate = parseRate(cells[2].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    'burgan-bank': (doc) => {
        let table = null;
        for (const t of doc.querySelectorAll('table')) {
            for (const th of t.querySelectorAll('th')) {
                if (th.textContent.indexOf('ON Plus') >= 0 || th.textContent.indexOf('Faiz Oran') >= 0) { table = t; break; }
            }
            if (table) break;
        }
        if (!table) return null;
        const tiers = [];
        for (const row of table.querySelectorAll('tbody tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) continue;
            const range = parseRange(cells[0].textContent);
            if (!range) continue;
            const nib = parseNumber(cells[1].textContent);
            const rate = parseRate(cells[3].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    alternatifbank: (doc) => {
        let table = null;
        for (const t of doc.querySelectorAll('table')) {
            if (t.textContent.indexOf('Cinsi') >= 0 && t.textContent.indexOf('Tutar') >= 0) { table = t; break; }
        }
        if (!table) {
            const section = doc.querySelector('section[data-url="faizorani"]');
            if (section) {
                const rateEl = section.querySelector('.card-rate .rate');
                if (rateEl) {
                    const rate = parseRate(rateEl.textContent);
                    if (rate > 0) return { tiers: [{ min: 0, max: 2000000, annualRate: rate, nib: 0 }] };
                }
            }
            return null;
        }
        const tiers = [];
        for (const row of table.querySelectorAll('tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) continue;
            if (cells[0].textContent.trim() !== 'TL') continue;
            const range = parseRange(cells[1].textContent);
            if (!range) continue;
            const rate = parseRate(cells[2].textContent);
            const nib = parseNumber(cells[4].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    odeabank: (doc) => {
        let table = null;
        for (const t of doc.querySelectorAll('table')) {
            for (const th of t.querySelectorAll('th')) {
                if (th.textContent.indexOf('TL') >= 0 && th.textContent.indexOf('Tutar') >= 0) { table = t; break; }
            }
            if (table) break;
        }
        if (!table) return null;
        const tiers = [];
        for (const row of table.querySelectorAll('tbody tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) continue;
            const range = parseRange(cells[0].textContent);
            if (!range) continue;
            const nib = parseNumber(cells[1].textContent);
            const rate = parseRate(cells[2].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    sekerbank: (doc) => {
        let table = null;
        for (const t of doc.querySelectorAll('table.table-bordered')) {
            if (t.textContent.indexOf('TL Tutar') >= 0 && t.textContent.indexOf('Avantajl') >= 0) { table = t; break; }
        }
        if (!table) return null;
        const rows = table.querySelectorAll('tr');
        const tiers = [];
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 5) continue;
            const range = parseRange(cells[0].textContent);
            if (!range) continue;
            const rate = parseRate(cells[1].textContent);
            const nib = parseNumber(cells[4].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    vakifbank: (doc) => {
        let rate = 0;
        const body = doc.body ? doc.body.textContent : '';
        const rm = body.match(/g[üu]nl[üu]k\s*%\s*([\d.,]+)/i) ||
            body.match(/Tan[ıi][şs]ma\s+Faizi[^%]*%\s*([\d.,]+)/i) ||
            body.match(/%\s*([\d.,]+)\s*(?:faiz|Tan[ıi][şs]ma)/i);
        if (rm) rate = parseRate(rm[1]);
        if (rate <= 0) return null;
        let nibTiers = [];
        const tlTab = doc.querySelector('#nav-tl');
        if (tlTab) {
            const nt = tlTab.querySelector('table');
            if (nt) for (const row of nt.querySelectorAll('tbody tr')) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) continue;
                let pct;
                const pt = cells[1].textContent.trim();
                if (pt.indexOf('tamam') >= 0) pct = 100;
                else pct = parseRate(pt);
                const range = parseRange(cells[0].textContent.trim());
                if (range) nibTiers.push({ min: range.min, max: range.max, pct });
            }
        }
        return { tiers: [{ min: 0, max: null, annualRate: rate, nib: 0, nibPercentage: nibTiers.length > 0 ? nibTiers[nibTiers.length - 1].pct : 10 }] };
    },

    'yapi-kredi': (doc) => {
        let table = null;
        for (const t of doc.querySelectorAll('table')) {
            if (t.textContent.indexOf('Hesaptaki Tutar') >= 0 && t.textContent.indexOf('Faiz Oran') >= 0) { table = t; break; }
        }
        if (!table) return null;
        let rows = table.querySelectorAll('tbody tr');
        if (!rows.length) rows = table.querySelectorAll('tr');
        const tiers = [];
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) continue;
            const range = parseRange(cells[0].textContent);
            if (!range) continue;
            const nib = parseNumber(cells[1].textContent);
            const rate = parseRate(cells[2].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    fibabanka: (doc) => {
        let table = null;
        for (const t of doc.querySelectorAll('table')) {
            const text = t.textContent;
            if ((text.indexOf('Kiraz') >= 0 || text.indexOf('Tutar Aral') >= 0) && text.indexOf('TL') >= 0 && text.indexOf('Faiz') >= 0) { table = t; break; }
        }
        if (!table) return null;
        let rows = table.querySelectorAll('tbody tr');
        if (!rows.length) rows = table.querySelectorAll('tr');
        const tiers = [];
        for (const row of rows) {
            const th = row.querySelector('th');
            const cells = row.querySelectorAll('td');
            if (!th || cells.length < 3) continue;
            const range = parseRange(th.textContent);
            if (!range) continue;
            const nib = parseNumber(cells[0].textContent);
            const rate = parseRate(cells[2].textContent) || parseRate(cells[1].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    anadolubank: (doc) => {
        let table = null;
        for (const t of doc.querySelectorAll('table')) {
            const text = t.textContent;
            if (text.indexOf('TL') >= 0 && text.indexOf('RENKLİ HESAP') >= 0 && text.indexOf('Dijital') >= 0) { table = t; break; }
        }
        if (!table) return null;
        const tiers = [];
        for (const row of table.querySelectorAll('tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) continue;
            const range = parseRange(cells[0].textContent);
            if (!range) continue;
            const nib = parseNumber(cells[1].textContent);
            const rate = parseRate(cells[3].textContent);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    'qnb-finansbank': (doc) => {
        let rateTable = null, nibTable = null;
        for (const t of doc.querySelectorAll('table')) {
            const text = t.textContent;
            if (!rateTable && text.indexOf('1-45') >= 0 && text.indexOf('151') >= 0 && text.indexOf('%') >= 0) rateTable = t;
            if (!nibTable && text.indexOf('Alt Limit') >= 0 && text.indexOf('Tutar') >= 0) nibTable = t;
        }
        if (!rateTable) return null;
        const nibLookup = [];
        if (nibTable) for (const row of nibTable.querySelectorAll('tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;
            nibLookup.push(parseFloat(cells[1].textContent.trim().replace(/,/g, '')) || 0);
        }
        const tiers = [];
        let idx = 0;
        for (const row of rateTable.querySelectorAll('tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;
            const rs = cells[0].textContent.trim();
            const m = rs.match(/([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)/);
            if (!m) continue;
            const mn = parseFloat(m[1].replace(/,/g, '')) || 0;
            const mx = parseFloat(m[2].replace(/,/g, '')) || 0;
            const rate = parseFloat(cells[1].textContent.trim().replace('%', '').trim()) || 0;
            const nib = idx < nibLookup.length ? nibLookup[idx] : 0;
            idx++;
            if (rate > 0) tiers.push({ min: mn, max: mx, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    'ziraat-bankasi': (doc) => {
        let nibTable = null, rateTable = null;
        for (const t of doc.querySelectorAll('table')) {
            for (const th of t.querySelectorAll('th')) {
                if (th.textContent.indexOf('Faizlendirilmeyecek') >= 0) nibTable = t;
                if (th.textContent.indexOf('Faiz Oran') >= 0) rateTable = t;
            }
        }
        if (!rateTable) return null;
        const nibLookup = [];
        if (nibTable) for (const row of nibTable.querySelectorAll('tbody tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;
            const range = parseRange(cells[0].textContent);
            const nib = parseNumber(cells[1].textContent);
            if (range) nibLookup.push({ min: range.min, max: range.max, nib });
        }
        const tiers = [];
        let i = 0;
        for (const row of rateTable.querySelectorAll('tbody tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;
            const range = parseRange(cells[0].textContent);
            if (!range) continue;
            const rate = parseRate(cells[1].textContent);
            const nib = nibLookup[i] ? nibLookup[i].nib : 0;
            i++;
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    enpara: (doc) => {
        const container = doc.querySelector('.enpara-deposit-interest-rates__flex-table.TRY');
        if (!container) return null;
        const hrs = container.querySelectorAll('hr');
        if (hrs.length < 1) return null;
        const tiers = [];
        for (const hr of hrs) {
            let el = hr.nextElementSibling;
            const vals = [];
            while (el && el.tagName !== 'HR') {
                const v = el.querySelector('.enpara-deposit-interest-rates__flex-table-value');
                if (v) vals.push(v.textContent.trim());
                el = el.nextElementSibling;
            }
            if (vals.length < 2) continue;
            const range = parseRange(vals[0]);
            if (!range) continue;
            const rate = parseRate(vals[1]);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib: 0 });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    'tom-bank': (doc) => {
        const table = doc.querySelector('table.limit-table');
        if (!table) return null;
        const tiers = [];
        for (const row of table.querySelectorAll('tbody tr')) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) continue;
            const rate = parseRate(cells[0].textContent);
            const min = parseNumber(cells[1].textContent);
            const max = parseNumber(cells[2].textContent);
            const nib = parseNumber(cells[3].textContent);
            if (rate > 0) tiers.push({ min, max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    },

    'getir-finans': (doc) => {
        let text = '';
        for (const s of doc.querySelectorAll('script')) {
            if (s.textContent.indexOf('demandConstants') >= 0 && s.textContent.indexOf('rateMap') >= 0) { text = s.textContent; break; }
        }
        if (!text) return null;
        text = text.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        const tlIdx = text.indexOf('"TL":{');
        if (tlIdx < 0) return null;
        const kvStart = text.indexOf('"keyValueList":[', tlIdx);
        if (kvStart < 0) return null;
        const arrStart = text.indexOf('[', kvStart);
        let depth = 0, arrEnd = arrStart;
        for (let c = arrStart; c < text.length && c < arrStart + 10000; c++) {
            if (text[c] === '[') depth++;
            else if (text[c] === ']') { depth--; if (depth === 0) { arrEnd = c + 1; break; } }
        }
        let list;
        try { list = JSON.parse(text.substring(arrStart, arrEnd)); } catch (e) { return null; }
        if (!Array.isArray(list)) return null;
        const tiers = [];
        for (const item of list) {
            const keyStr = (item.key || '').replace(/₺/g, '').replace(/\u20BA/g, '').trim();
            const range = parseRange(keyStr);
            if (!range) continue;
            const rate = parseRate(item.subValue);
            const nibStr = (item.value || '').replace(/₺/g, '').replace(/\u20BA/g, '').trim();
            const nib = parseNumber(nibStr);
            if (rate > 0) tiers.push({ min: range.min, max: range.max, annualRate: rate, nib });
        }
        return tiers.length > 0 ? { tiers } : null;
    }
};

// ===== Main =====

async function scrapeBank(bank) {
    try {
        if (apiParsers[bank.id] && bank.apiUrl) {
            return await apiParsers[bank.id](bank);
        }
        if (htmlParsers[bank.id]) {
            const doc = await fetchHTML(bank.url);
            return htmlParsers[bank.id](doc);
        }
        return null;
    } catch (e) {
        console.log('  ERROR ' + bank.id + ': ' + e.message);
        return null;
    }
}

async function main() {
    const configPath = path.join(__dirname, 'banks.json');
    const outputPath = path.join(__dirname, '..', 'data', 'rates.json');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const banks = config.banks.filter(b => b.enabled);

    console.log('Scraping ' + banks.length + ' banks...\n');

    const results = [];
    let success = 0;

    for (const bank of banks) {
        process.stdout.write(bank.name + '... ');
        const data = await scrapeBank(bank);
        if (data && data.tiers && data.tiers.length > 0) {
            console.log('OK (' + data.tiers.length + ' tiers)');
            results.push({
                id: bank.id, name: bank.name, type: bank.type,
                productName: bank.productName, website: bank.website || bank.url,
                url: bank.url, tiers: data.tiers
            });
            success++;
        } else {
            console.log('FAILED');
            results.push({
                id: bank.id, name: bank.name, type: bank.type,
                productName: bank.productName, website: bank.website || bank.url,
                url: bank.url, tiers: []
            });
        }
    }

    const output = {
        lastUpdated: new Date().toISOString(),
        defaultWithholdingRate: config.defaultWithholdingRate || 17.5,
        banks: results
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log('\nDone! ' + success + '/' + banks.length + ' banks. Saved to data/rates.json');

    if (success < banks.length / 2) {
        console.error('WARNING: Less than half of banks scraped successfully!');
        process.exit(1);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
