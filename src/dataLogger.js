const Gio = imports.gi.Gio;
const Utils = imports.utils.Utils;

function DataLogger(logPath) {
    this._logPath = String(logPath || "");
    this._logData = { days: {} };
}

DataLogger.prototype = {
    _getMaxSecondsForDay(dayKey) {
        const dayDate = Utils.dateFromKey(dayKey);
        if (!dayDate) return 24 * 60 * 60;

        const now = new Date();
        const isToday =
            dayDate.getFullYear() === now.getFullYear() &&
            dayDate.getMonth() === now.getMonth() &&
            dayDate.getDate() === now.getDate();

        if (!isToday) return 24 * 60 * 60;

        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const elapsed = Math.floor((now.getTime() - dayStart.getTime()) / 1000);
        return Math.max(0, elapsed);
    },

    _sanitizeAllDays() {
        this._ensureRootShape();
        const days = this._logData.days;
        const keys = Object.keys(days);
        let changed = false;

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const entry = this._ensureDayEntry(key);
            const maxSeconds = this._getMaxSecondsForDay(key);

            let activeSeconds = Utils.safeNonNegativeInt(entry.activeSeconds, 0);
            let idleSeconds = Utils.safeNonNegativeInt(entry.idleSeconds, 0);

            if (activeSeconds > maxSeconds) {
                activeSeconds = maxSeconds;
                changed = true;
            }

            const remainingForIdle = Math.max(0, maxSeconds - activeSeconds);
            if (idleSeconds > remainingForIdle) {
                idleSeconds = remainingForIdle;
                changed = true;
            }

            entry.activeSeconds = activeSeconds;
            entry.idleSeconds = idleSeconds;
        }

        return changed;
    },

    _ensureRootShape() {
        if (!this._logData || typeof this._logData !== "object") {
            this._logData = { days: {} };
            return;
        }
        if (!this._logData.days || typeof this._logData.days !== "object") {
            this._logData.days = {};
        }
    },

    _ensureDayEntry(key) {
        this._ensureRootShape();
        if (!this._logData.days[key] || typeof this._logData.days[key] !== "object") {
            this._logData.days[key] = {
                activeSeconds: 0,
                idleSeconds: 0,
                updatedAt: new Date().toISOString()
            };
        }

        const entry = this._logData.days[key];
        entry.activeSeconds = Utils.safeNonNegativeInt(entry.activeSeconds, 0);
        if (typeof entry.idleSeconds !== "number") {
            const totalSeconds = Utils.safeNonNegativeInt(entry.totalSeconds, entry.activeSeconds);
            entry.idleSeconds = Math.max(0, totalSeconds - entry.activeSeconds);
        } else {
            entry.idleSeconds = Utils.safeNonNegativeInt(entry.idleSeconds, 0);
        }

        if (typeof entry.updatedAt !== "string") {
            entry.updatedAt = new Date().toISOString();
        }

        return entry;
    },

    load() {
        try {
            if (!this._logPath) {
                this._logData = { days: {} };
                return;
            }
            const file = Gio.File.new_for_path(this._logPath);
            if (!file.query_exists(null)) return;

            const [ok, contents] = file.load_contents(null);
            if (!ok) return;

            const text = imports.byteArray.toString(contents);
            const parsed = JSON.parse(text);

            if (parsed && typeof parsed === "object") {
                this._logData = parsed;
            }
            this._ensureRootShape();
            const changed = this._sanitizeAllDays();
            if (changed) {
                this.save();
            }
        } catch (e) {
            this._logData = { days: {} };
        }
    },

    save() {
        try {
            if (!this._logPath) return;
            this._ensureRootShape();
            const file = Gio.File.new_for_path(this._logPath);
            const text = JSON.stringify(this._logData, null, 2);

            file.replace_contents(
                text,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            // ignore
        }
    },

    getData() {
        this._ensureRootShape();
        return this._logData;
    },

    ensureTodayEntry() {
        const key = Utils.todayKey();
        const entry = this._ensureDayEntry(key);
        return Utils.safeNonNegativeInt(entry.activeSeconds, 0);
    },

    getTodayEntry() {
        const key = Utils.todayKey();
        return this._ensureDayEntry(key);
    },

    updateTodayActive(activeSeconds) {
        const key = Utils.todayKey();
        const entry = this._ensureDayEntry(key);
        entry.activeSeconds = Utils.safeNonNegativeInt(activeSeconds, 0);
        entry.updatedAt = new Date().toISOString();
    },

    updateTodayIdle(incrementSeconds) {
        const key = Utils.todayKey();
        const entry = this._ensureDayEntry(key);
        entry.idleSeconds += Utils.safeNonNegativeInt(incrementSeconds, 0);
        entry.updatedAt = new Date().toISOString();
    }
};
