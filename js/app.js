// Main application module
(function () {
    var state = {
        banks: [],
        filteredBanks: [],
        sortField: 'rate',
        sortDir: 'desc',
        searchQuery: '',
        withholdingRate: 17.5,
        tablePrincipal: 100000
    };

    // ===== Loading Overlay =====
    var overlay = document.getElementById('loadingOverlay');
    var progressBar = document.getElementById('loadingProgressBar');
    var statusText = document.getElementById('loadingStatus');

    function showLoading() {
        if (overlay) {
            overlay.classList.remove('fade-out');
            overlay.style.display = 'flex';
        }
    }

    function hideLoading() {
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(function () {
                overlay.style.display = 'none';
            }, 400);
        }
    }

    // ===== Data Loading =====
    function loadData() {
        showLoading();
        if (statusText) statusText.textContent = 'Veriler yükleniyor...';
        if (progressBar) progressBar.style.width = '50%';

        fetch('data/rates.json')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (progressBar) progressBar.style.width = '100%';
                state.withholdingRate = data.defaultWithholdingRate || 17.5;

                state.banks = data.banks.map(function (b) {
                    return {
                        id: b.id,
                        name: b.name,
                        type: b.type,
                        productName: b.productName,
                        website: b.website || b.url,
                        tiers: b.tiers || [],
                        scrapeFailed: !b.tiers || b.tiers.length === 0
                    };
                });

                var successCount = state.banks.filter(function (b) { return !b.scrapeFailed; }).length;
                console.log('[App] Loaded: ' + successCount + '/' + state.banks.length + ' banka');

                // Set last updated from data
                if (data.lastUpdated) {
                    var d = new Date(data.lastUpdated);
                    var dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
                    document.getElementById('lastUpdated').textContent = dateStr;
                    document.getElementById('footerUpdate').textContent = dateStr;
                }

                updateSummary();
                applyFilters();
                initCalculator();
                hideLoading();
            })
            .catch(function (err) {
                console.error('Veri yuklenemedi:', err);
                hideLoading();
                document.getElementById('ratesBody').innerHTML =
                    '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted)">Veri yuklenemedi. Lutfen sayfayi yenileyin.</td></tr>';
            });
    }

    // ===== Helpers =====
    function bankHasRate(bank) {
        return !bank.scrapeFailed && bank.tiers && bank.tiers.length > 0;
    }

    function bankRate(bank) {
        if (!bankHasRate(bank)) return 0;
        return Calculator.getRateForPrincipal(bank, state.tablePrincipal);
    }

    function bankDailyNet(bank) {
        if (!bankHasRate(bank)) return 0;
        return Calculator.dailyNetForBank(bank, state.tablePrincipal, state.withholdingRate);
    }

    // ===== Summary Cards =====
    function updateSummary() {
        var banks = state.banks;
        if (!banks.length) return;

        updateRateCards();

        var successBanks = banks.filter(bankHasRate);
        document.getElementById('bankCount').textContent = successBanks.length + '/' + banks.length + ' banka';
    }

    function updateRateCards() {
        var banks = state.banks.filter(bankHasRate);
        if (!banks.length) {
            document.getElementById('highestRate').textContent = '-';
            document.getElementById('highestBank').textContent = 'Veri yok';
            document.getElementById('averageRate').textContent = '-';
            document.getElementById('dailyReturn').textContent = '-';
            return;
        }

        var best = banks.reduce(function (max, b) {
            return bankDailyNet(b) > bankDailyNet(max) ? b : max;
        }, banks[0]);
        var bestRate = bankRate(best);

        document.getElementById('highestRate').textContent = '%' + bestRate.toFixed(1);
        document.getElementById('highestBank').textContent = best.name;

        var avg = banks.reduce(function (sum, b) { return sum + bankRate(b); }, 0) / banks.length;
        document.getElementById('averageRate').textContent = '%' + avg.toFixed(1);

        var dailyNet = bankDailyNet(best);
        document.getElementById('dailyReturn').textContent = Calculator.formatTL(dailyNet);
        var formattedPrincipal = state.tablePrincipal.toLocaleString('tr-TR');
        document.getElementById('dailyReturnDetail').textContent = formattedPrincipal + '₺ için (en yüksek)';
    }

    // ===== Filtering & Sorting =====
    function applyFilters() {
        var banks = state.banks.slice();

        if (state.searchQuery) {
            var q = state.searchQuery.toLowerCase();
            banks = banks.filter(function (b) { return b.name.toLowerCase().indexOf(q) >= 0; });
        }

        banks.sort(function (a, b) {
            // Failed banks always go to the bottom
            var aFailed = !bankHasRate(a);
            var bFailed = !bankHasRate(b);
            if (aFailed !== bFailed) return aFailed ? 1 : -1;
            if (aFailed && bFailed) return a.name.localeCompare(b.name, 'tr');

            var valA, valB;
            switch (state.sortField) {
                case 'name':
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    return state.sortDir === 'asc'
                        ? valA.localeCompare(valB, 'tr')
                        : valB.localeCompare(valA, 'tr');
                case 'rate':
                    valA = bankRate(a);
                    valB = bankRate(b);
                    return state.sortDir === 'asc' ? valA - valB : valB - valA;
                case 'nib':
                    valA = Calculator.getNibForPrincipal(a, state.tablePrincipal);
                    valB = Calculator.getNibForPrincipal(b, state.tablePrincipal);
                    return state.sortDir === 'asc' ? valA - valB : valB - valA;
                case 'daily':
                    valA = bankDailyNet(a);
                    valB = bankDailyNet(b);
                    return state.sortDir === 'asc' ? valA - valB : valB - valA;
                default:
                    return 0;
            }
        });

        state.filteredBanks = banks;
        renderTable(banks);
        renderMobileCards(banks);
    }

    // ===== Table Rendering =====
    function renderTable(banks) {
        var tbody = document.getElementById('ratesBody');
        if (!banks.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted)">Sonuc bulunamadi</td></tr>';
            return;
        }

        var html = '';
        banks.forEach(function (bank) {
            var failed = !bankHasRate(bank);
            var rate = failed ? 0 : bankRate(bank);
            var dailyNet = failed ? 0 : bankDailyNet(bank);
            var rowClass = failed ? ' class="scrape-failed"' : '';

            html += '<tr' + rowClass + '>' +
                '<td class="bank-name"><a href="' + bank.website + '" target="_blank" rel="noopener">' + bank.name + '</a></td>';

            if (failed) {
                html += '<td class="rate-failed" colspan="3">Çekilemedi</td>';
            } else {
                var nib = Calculator.getNibForPrincipal(bank, state.tablePrincipal);
                var nibText = nib > 0 ? nib.toLocaleString('tr-TR') + ' ₺' : '-';
                html += '<td class="rate-value">%' + rate.toFixed(1) + '</td>' +
                    '<td class="nib-value">' + nibText + '</td>' +
                    '<td class="daily-net">' + Calculator.formatTL(dailyNet) + '</td>';
            }

            html += '</tr>';
        });

        tbody.innerHTML = html;
    }

    // ===== Mobile Card Rendering =====
    function renderMobileCards(banks) {
        var container = document.getElementById('mobileCards');
        if (!banks.length) {
            container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">Sonuc bulunamadi</p>';
            return;
        }

        var html = '';
        banks.forEach(function (bank) {
            var failed = !bankHasRate(bank);
            var rate = failed ? 0 : bankRate(bank);
            var dailyNet = failed ? 0 : bankDailyNet(bank);
            var nib = failed ? 0 : Calculator.getNibForPrincipal(bank, state.tablePrincipal);
            var nibText = nib > 0 ? nib.toLocaleString('tr-TR') + ' ₺' : '-';
            var principalLabel = state.tablePrincipal.toLocaleString('tr-TR');
            var cardClass = failed ? 'mobile-card scrape-failed' : 'mobile-card';

            html += '<div class="' + cardClass + '">' +
                '<div class="mobile-card-header">' +
                    '<span class="mobile-card-name"><a href="' + bank.website + '" target="_blank" rel="noopener">' + bank.name + '</a></span>' +
                '</div>';

            if (failed) {
                html += '<div class="mobile-card-failed">Çekilemedi</div>';
            } else {
                html += '<div class="mobile-card-rows">' +
                    '<div class="mobile-card-row"><span class="mobile-card-label">Yıllık Oran</span><span class="mobile-card-value rate">%' + rate.toFixed(1) + '</span></div>' +
                    '<div class="mobile-card-row"><span class="mobile-card-label">Faiz Dışı</span><span class="mobile-card-value">' + nibText + '</span></div>' +
                    '<div class="mobile-card-row"><span class="mobile-card-label">Günlük Net (' + principalLabel + ')</span><span class="mobile-card-value">' + Calculator.formatTL(dailyNet) + '</span></div>' +
                '</div>';
            }

            html += '</div>';
        });

        container.innerHTML = html;
    }

    // ===== Sort Headers =====
    function initSortHeaders() {
        document.querySelectorAll('.rates-table th.sortable').forEach(function (th) {
            th.addEventListener('click', function () {
                var field = this.getAttribute('data-sort');

                if (state.sortField === field) {
                    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortField = field;
                    state.sortDir = (field === 'name' || field === 'type') ? 'asc' : 'desc';
                }

                document.querySelectorAll('.rates-table th.sortable').forEach(function (h) {
                    h.classList.remove('sorted-asc', 'sorted-desc');
                    h.querySelector('.sort-icon').textContent = '↕';
                });

                this.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
                this.querySelector('.sort-icon').textContent = state.sortDir === 'asc' ? '↑' : '↓';

                applyFilters();
            });
        });
    }

    // ===== Search =====
    function initSearch() {
        var input = document.getElementById('searchInput');
        var debounceTimer;
        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                state.searchQuery = input.value.trim();
                applyFilters();
            }, 200);
        });
    }

    // ===== Calculator UI =====
    function initCalculator() {
        var select = document.getElementById('bankSelect');
        // Only show banks with successful scraping
        var successBanks = state.banks.filter(bankHasRate).sort(function (a, b) {
            return a.name.localeCompare(b.name, 'tr');
        });

        // Clear existing options (except first)
        while (select.options.length > 1) select.remove(1);

        successBanks.forEach(function (bank) {
            var opt = document.createElement('option');
            opt.value = bank.id;
            opt.textContent = bank.name;
            select.appendChild(opt);
        });

        document.getElementById('withholdingRate').value = state.withholdingRate;

        var customNibGroup = document.getElementById('customNibGroup');
        var customNibInput = document.getElementById('customNib');

        select.addEventListener('change', function () {
            if (select.value) {
                document.getElementById('customRate').value = '';
                customNibGroup.style.display = 'none';
                runCalculation();
            }
        });

        document.getElementById('customRate').addEventListener('input', function () {
            if (this.value) {
                document.getElementById('bankSelect').value = '';
                customNibGroup.style.display = '';
            } else {
                customNibGroup.style.display = 'none';
            }
        });

        customNibInput.addEventListener('blur', function () {
            var formatted = Calculator.formatInputTL(this.value);
            if (formatted) this.value = formatted;
        });

        var principalInput = document.getElementById('principal');
        principalInput.addEventListener('blur', function () {
            var formatted = Calculator.formatInputTL(this.value);
            if (formatted) this.value = formatted;
        });

        document.getElementById('calcBtn').addEventListener('click', runCalculation);

        document.querySelectorAll('#calculator input').forEach(function (input) {
            input.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') runCalculation();
            });
        });

        function runCalculation() {
            var principal = Calculator.parseTL(principalInput.value);
            var withholdingRate = parseFloat(document.getElementById('withholdingRate').value) || 17.5;
            var customRate = parseFloat(document.getElementById('customRate').value);
            var bankId = select.value;
            var annualRate;
            var selectedBank = null;
            if (customRate > 0) {
                annualRate = customRate;
            } else if (bankId) {
                selectedBank = state.banks.find(function (b) { return b.id === bankId; });
                if (selectedBank && bankHasRate(selectedBank)) {
                    annualRate = Calculator.getRateForPrincipal(selectedBank, principal);
                } else {
                    annualRate = 0;
                }
            } else {
                annualRate = 0;
            }

            if (principal <= 0 || annualRate <= 0) {
                alert('Lutfen ana para ve faiz orani girin.');
                return;
            }

            var effectivePrincipal;
            if (selectedBank) {
                effectivePrincipal = Calculator.getEffectivePrincipal(selectedBank, principal);
            } else {
                var customNib = Calculator.parseTL(customNibInput.value);
                effectivePrincipal = Math.max(0, principal - customNib);
            }
            var result = Calculator.calculate(effectivePrincipal, annualRate, withholdingRate);

            document.getElementById('resultAnnualRate').textContent = '%' + annualRate.toFixed(2);
            document.getElementById('resultDailyGross').textContent = Calculator.formatTL(result.dailyGross);
            document.getElementById('resultDailyTax').textContent = '-' + Calculator.formatTL(result.dailyTax);
            document.getElementById('resultDailyNet').textContent = Calculator.formatTL(result.dailyNet);
            document.getElementById('resultMonthlyNet').textContent = Calculator.formatTL(result.monthlyNet);
            document.getElementById('resultYearlyNet').textContent = Calculator.formatTL(result.yearlyNet);
            document.getElementById('resultTotal').textContent = Calculator.formatTL(principal + result.yearlyNet);

            var nibInfo = document.getElementById('resultNibInfo');
            if (nibInfo) {
                if (effectivePrincipal < principal) {
                    var nibAmount = principal - effectivePrincipal;
                    nibInfo.textContent = 'Faiz dışı bakiye: ' + nibAmount.toLocaleString('tr-TR') + ' ₺ (faiz işleyen: ' + effectivePrincipal.toLocaleString('tr-TR') + ' ₺)';
                    nibInfo.style.display = '';
                } else {
                    nibInfo.style.display = 'none';
                }
            }
        }
    }

    // ===== Table Principal Input =====
    function initTablePrincipal() {
        var input = document.getElementById('tablePrincipal');
        var debounceTimer;

        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                var val = Calculator.parseTL(input.value);
                if (val > 0) {
                    state.tablePrincipal = val;
                    applyFilters();
                    updateRateCards();
                }
            }, 300);
        });

        input.addEventListener('blur', function () {
            var formatted = Calculator.formatInputTL(this.value);
            if (formatted) this.value = formatted;
        });
    }

    // ===== Init =====
    function init() {
        initSortHeaders();
        initSearch();
        initTablePrincipal();
        loadData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
