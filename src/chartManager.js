const St = imports.gi.St;
const Cairo = imports.cairo;
const Constants = imports.constants;

function ChartManager() {}

ChartManager.prototype = {
    _formatTimeHHMM() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, "0");
        const m = String(now.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    },

    _secondsToHHMM(seconds) {
        const safe = Math.max(0, Number(seconds) || 0);
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    },

    _normalizeForMinuteDisplay(secondsByState, totalSeconds) {
        const safeStates = secondsByState || { active: 0, idle: 0, off: 0 };
        const safeTotalSeconds = Math.max(0, Number(totalSeconds) || 0);
        const totalMinutes = Math.floor(safeTotalSeconds / 60);

        const activeMinutesRaw = Math.floor(Math.max(0, Number(safeStates.active) || 0) / 60);
        const activeMinutes = Math.min(totalMinutes, activeMinutesRaw);

        const remainingAfterActive = Math.max(0, totalMinutes - activeMinutes);
        const idleMinutesRaw = Math.floor(Math.max(0, Number(safeStates.idle) || 0) / 60);
        const idleMinutes = Math.min(remainingAfterActive, idleMinutesRaw);

        const offMinutes = Math.max(0, totalMinutes - activeMinutes - idleMinutes);

        return {
            active: activeMinutes * 60,
            idle: idleMinutes * 60,
            off: offMinutes * 60
        };
    },

    _safeColor(color, fallback) {
        if (!Array.isArray(color) || color.length < 4) return fallback;
        return color;
    },

    createChart(title) {
        const box = new St.BoxLayout({ vertical: true, style_class: "activity-chart-item" });
        const titleLabel = new St.Label({ text: String(title || ""), style_class: "activity-chart-title" });
        
        const chart = new St.DrawingArea({ style_class: "activity-chart-canvas", reactive: true });
        chart.set_size(72, 72);
        chart._parts = { active: 0, idle: 0, off: 1 };

        // Tooltip Label
        const tooltipLabel = new St.Label({ 
            text: "",
            style: "background-color: rgba(20,20,20,0.95); color: rgb(200,200,255); padding: 6px 10px; border-radius: 4px; font-size: 9px; font-weight: bold; margin-top: 4px;"
        });

        chart.connect("repaint", (area) => {
            this._paintPie(area, area._parts || { active: 0, idle: 0, off: 1 });
        });

        // Update tooltip mit aktuellen Werten
        chart._updateTooltip = () => {
            const sec = chart._seconds || { active: 0, idle: 0, off: 0 };
            const totalSeconds = Math.max(0, Number(chart._totalSeconds) || 0);
            const normalized = this._normalizeForMinuteDisplay(sec, totalSeconds);

            const activeStr = this._secondsToHHMM(normalized.active);
            const idleStr = this._secondsToHHMM(normalized.idle);
            const offStr = this._secondsToHHMM(normalized.off);
            const tooltip = `Active: ${activeStr}\nIdle: ${idleStr}\nOff: ${offStr}`;
            tooltipLabel.set_text(tooltip);
        };

        // Tooltip initial anzeigen
        chart._updateTooltip();

        box.add_child(titleLabel);
        box.add_child(chart);
        box.add_child(tooltipLabel);

        return { box, chart, tooltip: tooltipLabel };
    },

    updateChart(chartRef, metrics, elapsedSeconds) {
        if (!chartRef || !chartRef.chart) return;

        const safeMetrics = metrics || {};
        const safeElapsedSeconds = Math.max(0, Number(elapsedSeconds) || 0);
        const active = Math.max(0, Number(safeMetrics.active) || 0);
        const idle = Math.max(0, Number(safeMetrics.idle) || 0);
        const known = Math.min(safeElapsedSeconds, active + idle);
        const off = Math.max(0, safeElapsedSeconds - known);

        const a = safeElapsedSeconds > 0 ? Math.min(active, safeElapsedSeconds) / safeElapsedSeconds : 0;
        const i = safeElapsedSeconds > 0 ? Math.min(idle, safeElapsedSeconds - Math.min(active, safeElapsedSeconds)) / safeElapsedSeconds : 0;
        const o = safeElapsedSeconds > 0 ? off / safeElapsedSeconds : 1;

        chartRef.chart._parts = { active: a, idle: i, off: o };
        chartRef.chart._seconds = { active: Math.max(0, Number(active) || 0), idle: Math.max(0, Number(idle) || 0), off: Math.max(0, Number(off) || 0) };
        chartRef.chart._totalSeconds = safeElapsedSeconds;
        if (chartRef.chart._updateTooltip) {
            chartRef.chart._updateTooltip();
        }
        chartRef.chart.queue_repaint();
    },

    _paintPie(area, parts) {
        if (!area) return;

        const active = Math.max(0, Math.min(1, parts.active || 0));
        const idle = Math.max(0, Math.min(1, parts.idle || 0));
        const off = Math.max(0, Math.min(1, parts.off || 0));
        const sum = active + idle + off;
        const a = sum > 0 ? active / sum : 0;
        const i = sum > 0 ? idle / sum : 0;
        const o = sum > 0 ? off / sum : 1;

        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.max(8, Math.min(w, h) / 2 - 3);

        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        const colorUndefined = this._safeColor(Constants.COLOR_UNDEFINED, [0.5, 0.5, 0.5, 0.25]);
        const colorActive = this._safeColor(Constants.COLOR_ACTIVE, [0.2, 0.75, 0.35, 0.95]);
        const colorIdle = this._safeColor(Constants.COLOR_IDLE, [0.2, 0.6, 0.95, 0.95]);
        const colorOff = this._safeColor(Constants.COLOR_OFF, [0.9, 0.2, 0.2, 0.9]);

        cr.setSourceRGBA(colorUndefined[0], colorUndefined[1], colorUndefined[2], colorUndefined[3]);
        cr.arc(cx, cy, radius, 0, 2 * Math.PI);
        cr.fill();

        const segments = [
            { ratio: a, color: colorActive },
            { ratio: i, color: colorIdle },
            { ratio: o, color: colorOff }
        ];

        let start = -Math.PI / 2;
        for (let idx = 0; idx < segments.length; idx++) {
            const segment = segments[idx];
            if (segment.ratio <= 0) continue;

            const end = start + (2 * Math.PI * segment.ratio);
            cr.setSourceRGBA(segment.color[0], segment.color[1], segment.color[2], segment.color[3]);
            cr.moveTo(cx, cy);
            cr.arc(cx, cy, radius, start, end);
            cr.closePath();
            cr.fill();

            start = end;
        }

        cr.setLineWidth(1.2);
        cr.setSourceRGBA(1, 1, 1, 0.25);
        cr.arc(cx, cy, radius, 0, 2 * Math.PI);
        cr.stroke();
    },

    paintLineChart(area, monthlyData, year) {
        if (!area) return;

        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        const safeMonthly = Array.isArray(monthlyData) ? monthlyData : [];

        const padding = { left: 10, right: 30, top: 30, bottom: 40 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        cr.setSourceRGBA(0.1, 0.1, 0.1, 0.8);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        let maxValue = 0;
        for (let i = 0; i < safeMonthly.length; i++) {
            const item = safeMonthly[i] || {};
            const total = (Number(item.active) || 0) + (Number(item.idle) || 0) + (Number(item.off) || 0);
            if (total > maxValue) maxValue = total;
        }

        if (maxValue === 0) maxValue = 1;

        cr.setSourceRGBA(0.3, 0.3, 0.3, 0.5);
        cr.setLineWidth(1);
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            cr.moveTo(padding.left, y);
            cr.lineTo(padding.left + chartWidth, y);
            cr.stroke();
        }

        cr.setSourceRGBA(0.6, 0.6, 0.6, 0.8);
        cr.setLineWidth(2);
        cr.moveTo(padding.left, padding.top);
        cr.lineTo(padding.left, padding.top + chartHeight);
        cr.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        cr.stroke();

        const columnWidth = chartWidth / 12;

        const colorActive = this._safeColor(Constants.COLOR_ACTIVE, [0.2, 0.75, 0.35, 0.95]);
        const colorIdle = this._safeColor(Constants.COLOR_IDLE, [0.2, 0.6, 0.95, 0.95]);
        const colorOff = this._safeColor(Constants.COLOR_OFF, [0.9, 0.2, 0.2, 0.9]);

        cr.setSourceRGBA(colorActive[0], colorActive[1], colorActive[2], 1);
        cr.setLineWidth(2.5);
        for (let i = 0; i < 12; i++) {
            const item = safeMonthly[i] || {};
            const x = padding.left + columnWidth * i + columnWidth / 2;
            const hours = (Number(item.active) || 0) / 3600;
            const y = padding.top + chartHeight - (hours / (maxValue / 3600)) * chartHeight;

            if (i === 0) cr.moveTo(x, y);
            else cr.lineTo(x, y);
        }
        cr.stroke();

        cr.setSourceRGBA(colorIdle[0], colorIdle[1], colorIdle[2], 1);
        cr.setLineWidth(2.5);
        for (let i = 0; i < 12; i++) {
            const item = safeMonthly[i] || {};
            const x = padding.left + columnWidth * i + columnWidth / 2;
            const hours = (Number(item.idle) || 0) / 3600;
            const y = padding.top + chartHeight - (hours / (maxValue / 3600)) * chartHeight;

            if (i === 0) cr.moveTo(x, y);
            else cr.lineTo(x, y);
        }
        cr.stroke();

        cr.setSourceRGBA(colorOff[0], colorOff[1], colorOff[2], 1);
        cr.setLineWidth(2.5);
        for (let i = 0; i < 12; i++) {
            const item = safeMonthly[i] || {};
            const x = padding.left + columnWidth * i + columnWidth / 2;
            const hours = (Number(item.off) || 0) / 3600;
            const y = padding.top + chartHeight - (hours / (maxValue / 3600)) * chartHeight;

            if (i === 0) cr.moveTo(x, y);
            else cr.lineTo(x, y);
        }
        cr.stroke();

        cr.setSourceRGBA(0.7, 0.7, 0.7, 1);
        cr.selectFontFace("Cantarell", 0, 0);
        cr.setFontSize(10);
        for (let i = 0; i < 12; i++) {
            const x = padding.left + columnWidth * i + columnWidth / 2;
            const y = padding.top + chartHeight + 20;
            const item = safeMonthly[i] || {};
            const label = item.label ? String(item.label) : String(i + 1);
            const extents = cr.textExtents(label);
            cr.moveTo(x - extents.width / 2, y);
            cr.showText(label);
        }

        cr.$dispose();
    }
};
