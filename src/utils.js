const GLib = imports.gi.GLib;

var Utils = {
    safeNonNegativeInt(value, fallback = 0) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(0, Math.floor(n));
    },

    formatSeconds(total) {
        const safeTotal = this.safeNonNegativeInt(total, 0);
        const h = Math.floor(safeTotal / 3600);
        const m = Math.floor((safeTotal % 3600) / 60);
        const s = safeTotal % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },

    rgbaStyle(color) {
        const safeColor = Array.isArray(color) ? color : [1, 1, 1, 1];
        const r = Math.round((Number(safeColor[0]) || 0) * 255);
        const g = Math.round((Number(safeColor[1]) || 0) * 255);
        const b = Math.round((Number(safeColor[2]) || 0) * 255);
        const alpha = Number(safeColor[3]);
        const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
        return `color: rgba(${r}, ${g}, ${b}, ${a});`;
    },

    todayKey() {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    },

    dateFromKey(key) {
        if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
        const parts = key.split("-");
        if (parts.length !== 3) return null;

        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);

        if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
        return d;
    },

    getIdleMs() {
        try {
            let [ok, out] = GLib.spawn_command_line_sync("xprintidle");
            if (!ok || !out) return 0;

            const s = imports.byteArray.toString(out).trim();
            const n = parseInt(s, 10);
            if (Number.isNaN(n)) return 0;
            return this.safeNonNegativeInt(n, 0);
        } catch (e) {
            return 0;
        }
    }
};
