// History modal with SVG trend chart
var History = (function () {
    var cache = null;

    function fetchHistory() {
        if (cache) return Promise.resolve(cache);
        return fetch('data/history.json?v=2')
            .then(function (r) { return r.json(); })
            .then(function (data) { cache = data; return data; })
            .catch(function () { return null; });
    }

    // ===== SVG Chart =====
    var CHART_W = 600;
    var CHART_H = 280;
    var PAD = { top: 20, right: 20, bottom: 40, left: 50 };
    var PLOT_W = CHART_W - PAD.left - PAD.right;
    var PLOT_H = CHART_H - PAD.top - PAD.bottom;

    function renderChart(container, dates, rates) {
        // Filter to valid (non-null) data points
        var points = [];
        for (var i = 0; i < dates.length; i++) {
            if (rates[i] !== null && rates[i] !== undefined) {
                points.push({ idx: i, date: dates[i], rate: rates[i] });
            }
        }

        if (points.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0">Henuz gecmis veri yok</p>';
            return;
        }

        // Y-axis range
        var minRate = points[0].rate, maxRate = points[0].rate;
        for (var i = 1; i < points.length; i++) {
            if (points[i].rate < minRate) minRate = points[i].rate;
            if (points[i].rate > maxRate) maxRate = points[i].rate;
        }
        var yPad = Math.max((maxRate - minRate) * 0.15, 0.5);
        var yMin = minRate - yPad;
        var yMax = maxRate + yPad;
        var yRange = yMax - yMin || 1;

        // X positions: spread across full date range
        var totalDays = dates.length - 1 || 1;

        function xPos(idx) { return PAD.left + (idx / totalDays) * PLOT_W; }
        function yPos(rate) { return PAD.top + (1 - (rate - yMin) / yRange) * PLOT_H; }

        var svg = '<svg viewBox="0 0 ' + CHART_W + ' ' + CHART_H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">';

        // Grid lines (4-5 horizontal)
        var gridLines = 4;
        for (var g = 0; g <= gridLines; g++) {
            var gy = PAD.top + (g / gridLines) * PLOT_H;
            var gVal = yMax - (g / gridLines) * yRange;
            svg += '<line x1="' + PAD.left + '" y1="' + gy + '" x2="' + (CHART_W - PAD.right) + '" y2="' + gy + '" stroke="var(--border-color)" stroke-dasharray="4,4" />';
            svg += '<text x="' + (PAD.left - 8) + '" y="' + (gy + 4) + '" text-anchor="end" fill="var(--text-muted)" font-size="11">%' + gVal.toFixed(1) + '</text>';
        }

        // X-axis date labels (max 7)
        var labelCount = Math.min(7, dates.length);
        for (var l = 0; l < labelCount; l++) {
            var di = Math.round(l * (dates.length - 1) / (labelCount - 1 || 1));
            var lx = xPos(di);
            var parts = dates[di].split('-');
            var label = parts[2] + '/' + parts[1];
            svg += '<text x="' + lx + '" y="' + (CHART_H - 8) + '" text-anchor="middle" fill="var(--text-muted)" font-size="11">' + label + '</text>';
        }

        // Line
        if (points.length === 1) {
            svg += '<circle cx="' + xPos(points[0].idx) + '" cy="' + yPos(points[0].rate) + '" r="4" fill="var(--accent)" />';
        } else {
            // Area fill
            var areaPath = 'M' + xPos(points[0].idx) + ',' + yPos(points[0].rate);
            for (var i = 1; i < points.length; i++) {
                areaPath += ' L' + xPos(points[i].idx) + ',' + yPos(points[i].rate);
            }
            areaPath += ' L' + xPos(points[points.length - 1].idx) + ',' + (PAD.top + PLOT_H);
            areaPath += ' L' + xPos(points[0].idx) + ',' + (PAD.top + PLOT_H) + ' Z';
            svg += '<path d="' + areaPath + '" fill="var(--accent)" opacity="0.1" />';

            // Line path
            var linePath = 'M' + xPos(points[0].idx) + ',' + yPos(points[0].rate);
            for (var i = 1; i < points.length; i++) {
                linePath += ' L' + xPos(points[i].idx) + ',' + yPos(points[i].rate);
            }
            svg += '<path d="' + linePath + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />';

            // Data point circles
            for (var i = 0; i < points.length; i++) {
                svg += '<circle cx="' + xPos(points[i].idx) + '" cy="' + yPos(points[i].rate) + '" r="3" fill="var(--accent)" />';
            }
        }

        // Invisible hover targets
        for (var i = 0; i < points.length; i++) {
            svg += '<circle cx="' + xPos(points[i].idx) + '" cy="' + yPos(points[i].rate) + '" r="12" fill="transparent" data-tip-idx="' + i + '" />';
        }

        svg += '</svg>';
        container.innerHTML = svg;

        // Tooltip
        var tooltip = document.createElement('div');
        tooltip.className = 'history-tooltip';
        tooltip.style.display = 'none';
        container.style.position = 'relative';
        container.appendChild(tooltip);

        var svgEl = container.querySelector('svg');
        var hovering = false;

        function showTip(pointIdx, clientX) {
            var p = points[pointIdx];
            var parts = p.date.split('-');
            tooltip.textContent = parts[2] + '/' + parts[1] + '/' + parts[0] + '  —  %' + p.rate.toFixed(1);
            tooltip.style.display = '';

            // Position tooltip near the point
            var rect = container.getBoundingClientRect();
            var tipX = clientX - rect.left;
            var tipW = tooltip.offsetWidth;
            if (tipX + tipW > rect.width - 8) tipX = rect.width - tipW - 8;
            if (tipX < 8) tipX = 8;
            tooltip.style.left = tipX + 'px';
            tooltip.style.top = '4px';
        }

        svgEl.addEventListener('mousemove', function (e) {
            var rect = svgEl.getBoundingClientRect();
            var mx = (e.clientX - rect.left) / rect.width * CHART_W;
            var closest = null, closestDist = Infinity;
            for (var i = 0; i < points.length; i++) {
                var d = Math.abs(xPos(points[i].idx) - mx);
                if (d < closestDist) { closestDist = d; closest = i; }
            }
            if (closest !== null) showTip(closest, e.clientX);
        });

        svgEl.addEventListener('mouseleave', function () {
            tooltip.style.display = 'none';
        });

        // Touch support
        svgEl.addEventListener('touchstart', function (e) {
            var touch = e.touches[0];
            var rect = svgEl.getBoundingClientRect();
            var mx = (touch.clientX - rect.left) / rect.width * CHART_W;
            var closest = null, closestDist = Infinity;
            for (var i = 0; i < points.length; i++) {
                var d = Math.abs(xPos(points[i].idx) - mx);
                if (d < closestDist) { closestDist = d; closest = i; }
            }
            if (closest !== null) showTip(closest, touch.clientX);
        }, { passive: true });
    }

    // ===== Modal =====
    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showModal(bankId, bankName) {
        fetchHistory().then(function (data) {
            if (!data || !data.dates || !data.dates.length) {
                return; // No history yet
            }

            var rates = data.banks[bankId] || [];
            var dates = data.dates;

            // Build recent rates table (last 7 entries with data)
            var recent = [];
            for (var i = dates.length - 1; i >= 0 && recent.length < 7; i--) {
                if (rates[i] !== null && rates[i] !== undefined) {
                    recent.push({ date: dates[i], rate: rates[i] });
                }
            }

            var recentHTML = '';
            if (recent.length > 0) {
                recentHTML = '<table class="history-recent-table"><thead><tr><th>Tarih</th><th>Oran</th></tr></thead><tbody>';
                for (var i = 0; i < recent.length; i++) {
                    var parts = recent[i].date.split('-');
                    var dateStr = parts[2] + '/' + parts[1] + '/' + parts[0];
                    recentHTML += '<tr><td>' + dateStr + '</td><td>%' + recent[i].rate.toFixed(1) + '</td></tr>';
                }
                recentHTML += '</tbody></table>';
            }

            var modalHTML = '<div class="history-card">' +
                '<div class="history-header">' +
                    '<h3 class="history-title">' + escapeHTML(bankName) + '</h3>' +
                    '<button class="history-close" id="historyClose">&times;</button>' +
                '</div>' +
                '<div class="history-chart-container" id="historyChart"></div>' +
                '<p class="history-note">100.000 TL icin yillik faiz orani (%)</p>' +
                recentHTML +
            '</div>';

            // Remove existing modal
            var existing = document.getElementById('historyModal');
            if (existing) existing.remove();

            var modal = document.createElement('div');
            modal.id = 'historyModal';
            modal.className = 'history-overlay';
            modal.innerHTML = modalHTML;
            document.body.appendChild(modal);

            // Render chart
            renderChart(document.getElementById('historyChart'), dates, rates);

            // Close handlers
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeModal();
            });
            document.getElementById('historyClose').addEventListener('click', closeModal);
            document.addEventListener('keydown', escHandler);
        });
    }

    function closeModal() {
        var modal = document.getElementById('historyModal');
        if (modal) {
            modal.classList.add('fade-out');
            setTimeout(function () { modal.remove(); }, 400);
        }
        document.removeEventListener('keydown', escHandler);
    }

    function escHandler(e) {
        if (e.key === 'Escape') closeModal();
    }

    return {
        show: showModal
    };
})();
