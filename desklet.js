const Desklet = imports.ui.desklet;
const DeskletManager = imports.ui.deskletManager;
const ModalDialog = imports.ui.modalDialog;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;

const UUID = "activity-logger@drgreent";
const DESKLET_META = DeskletManager.deskletMeta && DeskletManager.deskletMeta[UUID];
const DESKLET_DIR = DESKLET_META && DESKLET_META.path ? DESKLET_META.path : null;
const DESKLET_SRC_DIR = DESKLET_DIR ? `${DESKLET_DIR}/src` : null;
if (DESKLET_DIR && imports.searchPath.indexOf(DESKLET_DIR) === -1) {
    imports.searchPath.unshift(DESKLET_DIR);
}
if (DESKLET_SRC_DIR && imports.searchPath.indexOf(DESKLET_SRC_DIR) === -1) {
    imports.searchPath.unshift(DESKLET_SRC_DIR);
}

const Constants = imports.constants;
const Utils = imports.utils.Utils;
const DataLogger = imports.dataLogger.DataLogger;
const StatsCalculator = imports.statsCalculator.StatsCalculator;
const CustomMenuManager = imports.customMenuManager.CustomMenuManager;
const ChartManager = imports.chartManager.ChartManager;

function ActivityDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

ActivityDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init(metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

        this._dataLogger = new DataLogger(`${metadata.path}/data/activity-log.json`);
        this._statsCalculator = new StatsCalculator(this._dataLogger);
        this._chartManager = new ChartManager();

        this._activeSecondsToday = 0;
        this._lastTrackedDay = "";
        this._tickId = null;
        this._flushId = null;
        this._missingDependencies = [];

        this._buildUI();

        this._menuManager = new CustomMenuManager(
            this._menuButton,
            () => this._promptReportIssue()
        );

        this._dataLogger.load();
        this._activeSecondsToday = this._dataLogger.ensureTodayEntry();
        this._lastTrackedDay = Utils.todayKey();
        this._missingDependencies = this._getMissingDependencies();
        this._updateDependencyWarning();
        if (this._missingDependencies.length === 0) {
            this._startTracking();
        }
        this._render(0);
    },

    _buildUI() {
        this._box = new St.BoxLayout({ vertical: true, style_class: "activity-desklet" });

        // Title and menu button row (top)
        this._headerBox = new St.BoxLayout({ vertical: false, style_class: "activity-header" });
        this._title = new St.Label({ text: "Activity Logger", style_class: "activity-title", x_expand: true, y_align: St.Align.START });
        this._menuButton = new St.Button({ style_class: "activity-menu-button", label: "⋮", y_align: St.Align.START });
        this._menuButton.connect("clicked", () => this._menuManager.toggle());
        this._headerBox.add_child(this._title);
        this._headerBox.add_child(this._menuButton);

        // Status row
        this._status = new St.Label({ text: "Status: —", style_class: "activity-status" });

        this._statusDivider = new St.Widget({ style_class: "activity-divider" });
        this._dependencyWarning = this._createDependencyWarningBox();
        this._today = new St.Label({ text: "Active today: —" });
        this._idleTodayTotal = new St.Label({ text: "Idle today total: —" });
        this._idleLabel = new St.Label({ text: "Current idle: —" });
        this._idleDivider = new St.Widget({ style_class: "activity-divider" });

        this._chartsTitle = new St.Label({ text: "Analysis", style_class: "activity-section-title" });
        this._chartsRow = new St.BoxLayout({ style_class: "activity-charts-row" });
        this._dailyChart = this._chartManager.createChart("Daily");
        this._weeklyChart = this._chartManager.createChart("Weekly");
        this._monthlyChart = this._chartManager.createChart("Monthly");

        this._chartsRow.add_child(this._dailyChart.box);
        this._chartsRow.add_child(this._weeklyChart.box);
        this._chartsRow.add_child(this._monthlyChart.box);

        this._yearlyLegend = this._createLegendRow();
        this._yearlyTitle = new St.Label({
            text: "Last 12 months",
            style_class: "activity-section-title",
            x_align: St.Align.START,
            x_expand: false
        });
        this._yearlyChartData = this._statsCalculator.calculateRolling12Months();
        this._yearlyChart = new St.DrawingArea({
            style_class: "activity-chart-canvas",
            x_align: St.Align.START,
            x_expand: false
        });
        this._yearlyChart.set_size(220, 140);
        this._yearlyChart.connect("repaint", (area) => {
            this._chartManager.paintLineChart(area, this._yearlyChartData);
        });

        this._box.add_child(this._headerBox);
        this._box.add_child(this._status);
        this._box.add_child(this._statusDivider);
        this._box.add_child(this._dependencyWarning);
        this._box.add_child(this._today);
        this._box.add_child(this._idleTodayTotal);
        this._box.add_child(this._idleLabel);
        this._box.add_child(this._idleDivider);
        this._box.add_child(this._chartsTitle);
        this._box.add_child(this._chartsRow);
        this._box.add_child(new St.Widget({ style_class: "activity-divider" }));
        this._box.add_child(this._yearlyLegend);
        this._box.add_child(new St.Widget({ style_class: "activity-divider" }));
        this._box.add_child(this._yearlyTitle);
        this._box.add_child(this._yearlyChart);

        this.setContent(this._box);
    },

    _createDependencyWarningBox() {
        const warningBox = new St.BoxLayout({
            vertical: true,
            style: "padding: 8px; margin-top: 4px; margin-bottom: 6px; border-radius: 6px; background-color: rgba(170,40,40,0.18); border: 1px solid rgba(230,80,80,0.35);"
        });

        this._dependencyWarningTitle = new St.Label({
            text: "Missing dependencies",
            style: "font-size: 12px; font-weight: 700; color: rgb(255,190,190);"
        });
        this._dependencyWarningDetails = new St.Label({
            text: "",
            style: "font-size: 11px; color: rgb(240,220,220);"
        });
        this._dependencyWarningCommand = new St.Label({
            text: "",
            style: "font-size: 11px; color: rgb(245,245,245); margin-top: 3px;"
        });

        const actions = new St.BoxLayout({ style: "spacing: 8px; margin-top: 8px;" });
        this._installDepsButton = new St.Button({
            label: "Install",
            style: "padding: 6px 10px;"
        });
        this._installDepsButton.connect("clicked", () => this._installMissingDependencies());

        this._retryDepsButton = new St.Button({
            label: "Retry",
            style: "padding: 6px 10px;"
        });
        this._retryDepsButton.connect("clicked", () => this._retryDependencyCheck());

        actions.add_child(this._installDepsButton);
        actions.add_child(this._retryDepsButton);

        warningBox.add_child(this._dependencyWarningTitle);
        warningBox.add_child(this._dependencyWarningDetails);
        warningBox.add_child(this._dependencyWarningCommand);
        warningBox.add_child(actions);
        warningBox.hide();

        return warningBox;
    },

    _getMissingDependencies() {
        const checks = [
            { binary: "xprintidle", pkg: "xprintidle" }
        ];

        const missing = [];
        for (let i = 0; i < checks.length; i++) {
            if (!GLib.find_program_in_path(checks[i].binary)) {
                missing.push(checks[i]);
            }
        }

        return missing;
    },

    _getInstallCommandForMissing() {
        if (!Array.isArray(this._missingDependencies) || this._missingDependencies.length === 0) {
            return "";
        }

        const packages = [];
        for (let i = 0; i < this._missingDependencies.length; i++) {
            const pkg = this._missingDependencies[i].pkg;
            if (pkg && packages.indexOf(pkg) === -1) packages.push(pkg);
        }

        if (packages.length === 0) return "";
        return `sudo apt update && sudo apt install -y ${packages.join(" ")}`;
    },

    _updateDependencyWarning() {
        if (!this._dependencyWarning) return;

        if (!Array.isArray(this._missingDependencies) || this._missingDependencies.length === 0) {
            this._dependencyWarning.hide();
            return;
        }

        const missingList = this._missingDependencies.map((item) => item.binary).join(", ");
        const installCmd = this._getInstallCommandForMissing();

        this._dependencyWarningDetails.set_text(`Missing: ${missingList}. Activity tracking is paused until installed.`);
        this._dependencyWarningCommand.set_text(installCmd ? `Install command: ${installCmd}` : "Install command unavailable.");
        this._dependencyWarning.show();
    },

    _installMissingDependencies() {
        const installCmd = this._getInstallCommandForMissing();
        if (!installCmd) return;

        try {
            const escaped = installCmd.replace(/"/g, '\\"');
            Util.spawnCommandLine(`pkexec sh -c \"${escaped}\"`);
        } catch (e) {
            global.logError(e);
        }
    },

    _retryDependencyCheck() {
        this._missingDependencies = this._getMissingDependencies();
        this._updateDependencyWarning();

        if (this._missingDependencies.length === 0 && !this._tickId) {
            this._startTracking();
        }

        this._render(0);
    },

    _createLegendRow() {
        const row = new St.BoxLayout({ style: "spacing: 10px; margin-top: 4px; margin-bottom: 2px; margin-left: 10px;" });

        const items = [
            { label: "Active", color: "rgb(51, 191, 89)" },
            { label: "Idle", color: "rgb(51, 153, 242)" },
            { label: "Off", color: "rgb(230, 51, 51)" }
        ];

        for (let i = 0; i < items.length; i++) {
            const itemBox = new St.BoxLayout({ style: "spacing: 6px;" });
            const swatch = new St.Widget({ style: `background-color: ${items[i].color}; border-radius: 2px;` });
            swatch.set_size(10, 10);
            const label = new St.Label({ text: items[i].label, style: "font-size: 11px; color: rgb(200,200,200);" });
            itemBox.add_child(swatch);
            itemBox.add_child(label);
            row.add_child(itemBox);
        }

        return row;
    },

    _startTracking() {
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Constants.TICK_SECONDS, () => {
            try {
                this._tick();
            } catch (e) {
                global.logError(e);
            }
            return GLib.SOURCE_CONTINUE;
        });

        this._flushId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Constants.FLUSH_EVERY_SECONDS, () => {
            try {
                this._dataLogger.save();
            } catch (e) {
                global.logError(e);
            }
            return GLib.SOURCE_CONTINUE;
        });
    },

    _tick() {
        const currentDay = Utils.todayKey();
        
        // Reset _activeSecondsToday if day has changed
        if (this._lastTrackedDay !== currentDay) {
            this._lastTrackedDay = currentDay;
            this._activeSecondsToday = this._dataLogger.ensureTodayEntry();
        }
        
        const idleMs = Utils.safeNonNegativeInt(Utils.getIdleMs(), 0);
        const isActive = idleMs < Constants.IDLE_THRESHOLD_MS;

        if (isActive) {
            this._activeSecondsToday += Constants.TICK_SECONDS;
            this._dataLogger.updateTodayActive(this._activeSecondsToday);
        } else {
            this._dataLogger.updateTodayIdle(Constants.TICK_SECONDS);
        }

        this._render(idleMs);
    },

    _render(idleMs) {
        if (!this._status || !this._today || !this._idleTodayTotal || !this._idleLabel) return;

        if (Array.isArray(this._missingDependencies) && this._missingDependencies.length > 0) {
            this._status.set_text("Status: unavailable (missing dependency)");
            this._status.set_style(Utils.rgbaStyle(Constants.COLOR_OFF));
        } else {
            const isActive = idleMs < Constants.IDLE_THRESHOLD_MS;
            const status = isActive ? "active" : "idle";
            this._status.set_text(`Status: ${status}`);
            this._status.set_style(Utils.rgbaStyle(isActive ? Constants.COLOR_ACTIVE : Constants.COLOR_IDLE));
        }

        const todayEntry = this._dataLogger.getTodayEntry();
        const activeToday = typeof todayEntry.activeSeconds === "number" ? todayEntry.activeSeconds : 0;
        const idleTodayTotal = typeof todayEntry.idleSeconds === "number" ? todayEntry.idleSeconds : 0;
        this._today.set_text(`Active today: ${Utils.formatSeconds(activeToday)}`);
        this._idleTodayTotal.set_text(`Idle today total: ${Utils.formatSeconds(idleTodayTotal)}`);
        this._idleLabel.set_text(`Current idle: ${Math.floor(idleMs / 1000)}s`);

        this._updateCharts();
    },

    _updateCharts() {
        const daily = this._statsCalculator.calculateDailyStats();
        const weekly = this._statsCalculator.calculateWeeklyStats();
        const monthly = this._statsCalculator.calculateMonthlyStats();

        this._chartManager.updateChart(this._dailyChart, daily.metrics, daily.elapsedSeconds);
        this._chartManager.updateChart(this._weeklyChart, weekly.metrics, weekly.elapsedSeconds);
        this._chartManager.updateChart(this._monthlyChart, monthly.metrics, monthly.elapsedSeconds);

        this._yearlyChartData = this._statsCalculator.calculateRolling12Months();
        if (this._yearlyChart) this._yearlyChart.queue_repaint();
    },

    _promptReportIssue() {
        const dialog = new ModalDialog.ModalDialog();
        const box = new St.BoxLayout({ vertical: true, style: "padding: 18px; min-width: 520px;" });

        const title = new St.Label({
            text: "Report an issue",
            style: "font-size: 16px; font-weight: 700; margin-bottom: 8px;"
        });
        const text = new St.Label({
            text: "Send a summarized activity log with the report?\nOnly monthly totals are included, limited to the last 24 months.",
            style: "font-size: 12px;"
        });

        box.add_child(title);
        box.add_child(text);
        dialog.contentLayout.add_child(box);

        dialog.setButtons([
            {
                label: "No",
                action: () => {
                    dialog.close();
                    this._reportIssue(false);
                }
            },
            {
                label: "Yes",
                action: () => {
                    dialog.close();
                    this._reportIssue(true);
                }
            }
        ]);

        try {
            dialog.open();
        } catch (e) {
            global.logError(e);
            this._reportIssue(false);
        }
    },

    _buildReportSummary(maxMonths) {
        const months = Math.max(1, Math.min(24, Number(maxMonths) || 24));
        const now = new Date();
        const lines = [];

        for (let offset = months - 1; offset >= 0; offset--) {
            const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const year = d.getFullYear();
            const month = d.getMonth();
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);

            const metrics = this._statsCalculator.sumMetricsBetween(startDate, endDate);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const totalSeconds = daysInMonth * 24 * 3600;
            const active = Math.max(0, Number(metrics.active) || 0);
            const idle = Math.max(0, Number(metrics.idle) || 0);
            const off = Math.max(0, totalSeconds - active - idle);

            if (active === 0 && idle === 0) continue;

            const monthLabel = `${year}-${String(month + 1).padStart(2, "0")}`;
            lines.push(`${monthLabel} | active ${Utils.formatSeconds(active)} | idle ${Utils.formatSeconds(idle)} | off ${Utils.formatSeconds(off)}`);
        }

        if (lines.length === 0) {
            return "Summary (last 24 months): no recorded activity.";
        }

        return `Summary (last 24 months, monthly totals):\n${lines.join("\n")}`;
    },

    _reportIssue(includeSummary) {
        try {
            const subject = encodeURIComponent("Activity Logger Issue");
            const base = "mailto:thomas.just.dev@gmail.com";

            if (!includeSummary) {
                Util.spawnCommandLine(`xdg-open \"${base}?subject=${subject}\"`);
                return;
            }

            const summary = this._buildReportSummary(24);
            const body = encodeURIComponent(`Please describe the issue:\n\n---\n${summary}`);
            Util.spawnCommandLine(`xdg-open \"${base}?subject=${subject}&body=${body}\"`);
        } catch (e) {
            global.logError(e);
        }
    },

    _showYearlyStats() {
        const monthlyStats = this._statsCalculator.calculateRolling12Months();

        const dialog = new ModalDialog.ModalDialog();
        const mainBox = new St.BoxLayout({ vertical: true, style: "padding: 20px; min-width: 600px;" });

        const legendRow = this._createLegendRow();
        mainBox.add_child(legendRow);

        const title = new St.Label({
            text: "Activity Analysis (Last 12 months)",
            style: "font-size: 16px; font-weight: 700; margin-bottom: 10px;"
        });
        mainBox.add_child(title);

        const chartCanvas = new St.DrawingArea({ width: 560, height: 280, style: "background: rgba(20,20,20,0.5); border-radius: 8px;" });
        chartCanvas.connect("repaint", (area) => this._chartManager.paintLineChart(area, monthlyStats));
        mainBox.add_child(chartCanvas);

        const statsText = this._statsCalculator.getYearlyStatsText(new Date().getFullYear(), monthlyStats);
        const statsLabel = new St.Label({
            text: statsText,
            style: "font-size: 12px; margin-top: 10px;"
        });
        mainBox.add_child(statsLabel);

        dialog.contentLayout.add_child(mainBox);
        dialog.setButtons([{
            label: "Close",
            action: () => dialog.close()
        }]);

        try {
            dialog.open();
        } catch (e) {
            global.logError(e);
        }
    },

    on_desklet_removed() {
        if (this._tickId) {
            GLib.source_remove(this._tickId);
            this._tickId = null;
        }
        if (this._flushId) {
            GLib.source_remove(this._flushId);
            this._flushId = null;
        }
        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }
        if (this._dataLogger) this._dataLogger.save();
    }
};

function main(metadata, desklet_id) {
    return new ActivityDesklet(metadata, desklet_id);
}
