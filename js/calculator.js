// Calculator module
var Calculator = (function () {
    /**
     * Calculate daily gross return
     * Formula: principal * (annualRate / 365 / 100)
     */
    function dailyGross(principal, annualRate) {
        return principal * (annualRate / 365 / 100);
    }

    /**
     * Calculate withholding tax (stopaj)
     */
    function withholdingTax(grossAmount, withholdingRate) {
        return grossAmount * (withholdingRate / 100);
    }

    /**
     * Calculate daily net return
     */
    function dailyNet(principal, annualRate, withholdingRate) {
        var gross = dailyGross(principal, annualRate);
        var tax = withholdingTax(gross, withholdingRate);
        return gross - tax;
    }

    /**
     * Calculate compound return over N days
     */
    function compoundReturn(principal, annualRate, withholdingRate, days) {
        var dailyNetRate = (annualRate / 365 / 100) * (1 - withholdingRate / 100);
        return principal * (Math.pow(1 + dailyNetRate, days) - 1);
    }

    /**
     * Full calculation result
     */
    function calculate(principal, annualRate, withholdingRate) {
        var dGross = dailyGross(principal, annualRate);
        var dTax = withholdingTax(dGross, withholdingRate);
        var dNet = dGross - dTax;
        var monthlyNet = compoundReturn(principal, annualRate, withholdingRate, 30);
        var yearlyNet = compoundReturn(principal, annualRate, withholdingRate, 365);

        return {
            annualRate: annualRate,
            dailyGross: dGross,
            dailyTax: dTax,
            dailyNet: dNet,
            monthlyNet: monthlyNet,
            yearlyNet: yearlyNet,
            yearlyTotal: principal + yearlyNet
        };
    }

    /**
     * Format number as Turkish Lira
     */
    function formatTL(amount) {
        return amount.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' ₺';
    }

    /**
     * Parse Turkish formatted number (e.g., "100.000" -> 100000)
     */
    function parseTL(str) {
        if (!str) return 0;
        // Remove currency symbol and spaces
        str = str.replace(/[₺\s]/g, '');
        // Replace dots used as thousand separators, keep comma as decimal
        str = str.replace(/\./g, '').replace(',', '.');
        var num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Format input as Turkish number while typing
     */
    function formatInputTL(value) {
        var num = parseTL(value);
        if (num === 0 && value !== '0') return '';
        return num.toLocaleString('tr-TR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    /**
     * Get the annual rate for a bank based on principal (tiered rates)
     * bank.tiers = [{ min, max, annualRate }, ...]
     * Falls back to bank.annualRate if no tiers defined
     */
    function getRateForPrincipal(bank, principal) {
        if (!bank.tiers || !bank.tiers.length) {
            return bank.annualRate || 0;
        }
        for (var i = 0; i < bank.tiers.length; i++) {
            var tier = bank.tiers[i];
            if (principal >= tier.min && (tier.max === null || principal <= tier.max)) {
                return tier.annualRate;
            }
        }
        return bank.tiers[bank.tiers.length - 1].annualRate;
    }

    /**
     * Get the non-interest balance for a given principal from the matching tier.
     * Looks up the tier that matches the principal and returns its nib value.
     * For percentage-based NIB (nibPercentage on tier), calculates from principal.
     */
    function getNibForPrincipal(bank, principal) {
        if (!bank.tiers || !bank.tiers.length) return 0;
        for (var i = 0; i < bank.tiers.length; i++) {
            var tier = bank.tiers[i];
            if (principal >= tier.min && (tier.max === null || principal <= tier.max)) {
                if (tier.nibPercentage > 0) {
                    return principal * (tier.nibPercentage / 100);
                }
                return tier.nib || 0;
            }
        }
        var last = bank.tiers[bank.tiers.length - 1];
        if (last.nibPercentage > 0) {
            return principal * (last.nibPercentage / 100);
        }
        return last.nib || 0;
    }

    /**
     * Get the effective principal after subtracting non-interest balance.
     * Returns 0 if principal <= nib.
     */
    function getEffectivePrincipal(bank, principal) {
        var nib = getNibForPrincipal(bank, principal);
        var effective = principal - nib;
        return effective > 0 ? effective : 0;
    }

    /**
     * Calculate daily net return for a bank (tier-aware + per-tier NIB)
     */
    function dailyNetForBank(bank, principal, withholdingRate) {
        var rate = getRateForPrincipal(bank, principal);
        var effective = getEffectivePrincipal(bank, principal);
        return dailyNet(effective, rate, withholdingRate);
    }

    /**
     * Full calculation for a bank (tier-aware + per-tier NIB)
     */
    function calculateForBank(bank, principal, withholdingRate) {
        var rate = getRateForPrincipal(bank, principal);
        var effective = getEffectivePrincipal(bank, principal);
        var result = calculate(effective, rate, withholdingRate);
        result.annualRate = rate;
        result.nonInterestBalance = getNibForPrincipal(bank, principal);
        result.effectivePrincipal = effective;
        result.yearlyTotal = principal + result.yearlyNet;
        return result;
    }

    return {
        dailyGross: dailyGross,
        dailyNet: dailyNet,
        compoundReturn: compoundReturn,
        calculate: calculate,
        calculateForBank: calculateForBank,
        dailyNetForBank: dailyNetForBank,
        formatTL: formatTL,
        parseTL: parseTL,
        formatInputTL: formatInputTL,
        getRateForPrincipal: getRateForPrincipal,
        getNibForPrincipal: getNibForPrincipal,
        getEffectivePrincipal: getEffectivePrincipal
    };
})();
