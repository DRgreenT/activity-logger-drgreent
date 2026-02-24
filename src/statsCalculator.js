const Utils = imports.utils.Utils;

function StatsCalculator(dataLogger) {
    this._dataLogger = dataLogger;
}

StatsCalculator.prototype = {
    sumMetricsBetween(startDate, endDate) {
        if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
            return { active: 0, idle: 0 };
        }

        let active = 0;
        let idle = 0;
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();
        const logData = this._dataLogger && typeof this._dataLogger.getData === "function"
            ? this._dataLogger.getData()
            : { days: {} };

        if (!logData || !logData.days || typeof logData.days !== "object") {
            return { active: 0, idle: 0 };
        }

        for (const key in logData.days) {
            if (!Object.prototype.hasOwnProperty.call(logData.days, key)) continue;
            const dayDate = Utils.dateFromKey(key);
            if (!dayDate) continue;

            const t = dayDate.getTime();
            if (t < startTime || t > endTime) continue;

            const entry = logData.days[key];
            const activeSeconds = Utils.safeNonNegativeInt(entry && entry.activeSeconds, 0);
            const idleSeconds = (entry && typeof entry.idleSeconds === "number")
                ? Utils.safeNonNegativeInt(entry.idleSeconds, 0)
                : Math.max(0, Utils.safeNonNegativeInt(entry && entry.totalSeconds, activeSeconds) - activeSeconds);

            active += activeSeconds;
            idle += idleSeconds;
        }

        return { active, idle };
    },

    calculateDailyStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const elapsedSeconds = 24 * 60 * 60;
        const metrics = this.sumMetricsBetween(todayStart, todayStart);

        return { metrics, elapsedSeconds };
    },

    calculateWeeklyStats() {
        const now = new Date();
        const weekDayIndex = (now.getDay() + 6) % 7;
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekDayIndex);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const elapsedSeconds = 7 * 24 * 60 * 60;
        const metrics = this.sumMetricsBetween(weekStart, todayStart);

        return { metrics, elapsedSeconds };
    },

    calculateMonthlyStats() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const elapsedSeconds = daysInMonth * 24 * 60 * 60;
        const metrics = this.sumMetricsBetween(monthStart, todayStart);

        return { metrics, elapsedSeconds };
    },

    calculateRolling12Months() {
        const now = new Date();
        const results = [];

        for (let offset = 11; offset >= 0; offset--) {
            const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const year = d.getFullYear();
            const month = d.getMonth();

            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            const metrics = this.sumMetricsBetween(startDate, endDate);

            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const totalSeconds = daysInMonth * 24 * 3600;
            const recorded = metrics.active + metrics.idle;
            const off = Math.max(0, totalSeconds - recorded);

            results.push({
                active: metrics.active,
                idle: metrics.idle,
                off: off,
                label: String(month + 1)
            });
        }

        return results;
    },

    getYearlyStatsText(year, monthlyData) {
        if (!Array.isArray(monthlyData)) {
            return `Total Active: ${Utils.formatSeconds(0)}  |  Total Idle: ${Utils.formatSeconds(0)}  |  Total Off: ${Utils.formatSeconds(0)}`;
        }

        let totalActive = 0;
        let totalIdle = 0;
        let totalOff = 0;

        for (let i = 0; i < monthlyData.length; i++) {
            const item = monthlyData[i] || {};
            totalActive += Utils.safeNonNegativeInt(item.active, 0);
            totalIdle += Utils.safeNonNegativeInt(item.idle, 0);
            totalOff += Utils.safeNonNegativeInt(item.off, 0);
        }

        return `Total Active: ${Utils.formatSeconds(totalActive)}  |  Total Idle: ${Utils.formatSeconds(totalIdle)}  |  Total Off: ${Utils.formatSeconds(totalOff)}`;
    }
};
