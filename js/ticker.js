// Live currency ticker via canlidoviz.com WebSocket
(function () {
    var WS_URL = 'wss://s.canlidoviz.com/socket.io/?EIO=4&transport=websocket';

    // CID -> { code, decimals, closingPrice }
    var currencies = {
        '1':   { code: 'USD', decimals: 4 },
        '50':  { code: 'EUR', decimals: 4 },
        '100': { code: 'GBP', decimals: 4 },
        '32':  { code: 'GA',  decimals: 2 },
        '12':  { code: 'ONS', decimals: 2 },
        '62':  { code: 'BTC', decimals: 2 }
    };

    var closingPrices = {};
    var currentPrices = {};
    var ws = null;
    var pingInterval = null;
    var reconnectTimer = null;

    function connect() {
        if (ws && ws.readyState <= 1) return;
        try { ws = new WebSocket(WS_URL); } catch (e) { scheduleReconnect(); return; }

        ws.onopen = function () {
            // Read closing prices from DOM cp attributes (set by initial page data)
            var items = document.querySelectorAll('.ticker-item[data-cid]');
            for (var i = 0; i < items.length; i++) {
                var cid = items[i].getAttribute('data-cid');
                var cp = items[i].getAttribute('data-cp');
                if (cp) closingPrices[cid] = parseFloat(cp);
            }
        };

        ws.onmessage = function (e) {
            var msg = e.data;

            // Engine.IO open
            if (msg.charAt(0) === '0') {
                var session = JSON.parse(msg.substring(1));
                if (session.pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = setInterval(function () {
                        if (ws.readyState === 1) ws.send('2');
                    }, session.pingInterval);
                }
                // Socket.IO connect
                ws.send('40');
                return;
            }

            // Engine.IO ping
            if (msg === '2') { ws.send('3'); return; }
            // Engine.IO pong
            if (msg === '3') return;

            // Socket.IO connected
            if (msg.substring(0, 2) === '40') {
                // Subscribe
                var codes = Object.keys(currencies).map(function (cid) { return currencies[cid].code; });
                ws.send('42' + JSON.stringify(['us', { t: [], c: ['USD', 'EUR', 'GBP', 'GA', 'XAU/USD', 'BTC'], m: false }]));
                return;
            }

            // Socket.IO event
            if (msg.substring(0, 2) === '42') {
                var payload = JSON.parse(msg.substring(2));
                if (payload[0] === 'c' && Array.isArray(payload[1])) {
                    handleData(payload[1]);
                }
            }
        };

        ws.onclose = function () {
            clearInterval(pingInterval);
            scheduleReconnect();
        };

        ws.onerror = function () {
            ws.close();
        };
    }

    function scheduleReconnect() {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 5000);
    }

    function handleData(dataArr) {
        for (var i = 0; i < dataArr.length; i++) {
            var parts = dataArr[i].split('|');
            var cid = parts[0];
            if (!currencies[cid]) continue;

            var buy = parts[1] ? parseFloat(parts[1]) : null;
            var sell = parts[2] ? parseFloat(parts[2]) : null;
            var price = sell || buy;
            if (!price) continue;

            // Store closing price from first data if not set
            if (!closingPrices[cid]) closingPrices[cid] = price;

            var prev = currentPrices[cid];
            currentPrices[cid] = price;

            updateElement(cid, price, prev);
        }
    }

    function updateElement(cid, price, prevPrice) {
        var cfg = currencies[cid];
        var priceEl = document.getElementById('tick-' + cid);
        var changeEl = document.getElementById('tick-chg-' + cid);
        if (!priceEl) return;

        var formatted = price.toLocaleString('tr-TR', {
            minimumFractionDigits: cfg.decimals,
            maximumFractionDigits: cfg.decimals
        });
        priceEl.textContent = formatted;

        // Flash animation
        if (prevPrice && prevPrice !== price) {
            priceEl.classList.remove('tick-flash-up', 'tick-flash-down');
            void priceEl.offsetWidth; // reflow
            priceEl.classList.add(price > prevPrice ? 'tick-flash-up' : 'tick-flash-down');
        }

        // Change percentage
        var cp = closingPrices[cid];
        if (cp && changeEl) {
            var pct = ((price - cp) / cp * 100).toFixed(2);
            var sign = pct >= 0 ? '+' : '';
            changeEl.textContent = '%' + sign + pct;
            changeEl.className = 'ticker-change ' + (pct > 0 ? 'tick-up' : pct < 0 ? 'tick-down' : '');
        }
    }

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', connect);
    } else {
        connect();
    }
})();
