const Main = imports.ui.main;
const St = imports.gi.St;

function CustomMenuManager(menuButton, onReportIssue) {
    this._menuButton = menuButton;
    this._onReportIssue = typeof onReportIssue === "function" ? onReportIssue : () => {};
    this._menu = null;
    this._clickOutsideId = null;
    this._setupMenu();
}

CustomMenuManager.prototype = {
    _setupMenu() {
        this._menu = new St.BoxLayout({
            vertical: true,
            style: 'background-color: rgba(30,30,30,0.98); border-radius: 6px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);'
        });
        this._menu.hide();
        Main.uiGroup.add_actor(this._menu);

        const reportButton = this._createButton("Report an issue", this._onReportIssue.bind(this));
        this._menu.add_child(reportButton);
    },

    _createButton(label, onClick) {
        const button = new St.Button({
            label: label,
            style: 'padding: 8px 12px; color: rgb(220,220,220); text-align: left; font-size: 13px;',
            style_class: 'popup-menu-item'
        });

        button.connect('clicked', () => {
            this.hide();
            onClick();
        });

        button.connect('enter-event', () => {
            button.style = 'padding: 8px 12px; color: rgb(255,255,255); background-color: rgba(255,255,255,0.1); text-align: left; font-size: 13px;';
        });

        button.connect('leave-event', () => {
            button.style = 'padding: 8px 12px; color: rgb(220,220,220); text-align: left; font-size: 13px;';
        });

        return button;
    },

    toggle() {
        if (this._menu.visible) {
            this.hide();
        } else {
            this.show();
        }
    },

    show() {
        if (!this._menu || !this._menuButton) return;

        const [stageX, stageY] = this._menuButton.get_transformed_position();
        const [buttonWidth, buttonHeight] = this._menuButton.get_transformed_size();

        this._menu.set_position(
            Math.floor(stageX + buttonWidth - this._menu.width),
            Math.floor(stageY + buttonHeight + 2)
        );
        this._menu.show();

        if (!this._clickOutsideId) {
            this._clickOutsideId = global.stage.connect('button-press-event', (actor, event) => {
                const source = event ? event.get_source() : null;
                if (!source) return;
                if (!this._menu.contains(source) &&
                    !this._menuButton.contains(source)) {
                    this.hide();
                }
            });
        }
    },

    hide() {
        if (!this._menu) return;
        this._menu.hide();
        if (this._clickOutsideId) {
            global.stage.disconnect(this._clickOutsideId);
            this._clickOutsideId = null;
        }
    },

    destroy() {
        if (this._clickOutsideId && global.stage) {
            try {
                global.stage.disconnect(this._clickOutsideId);
            } catch (e) {
                // ignore
            }
        }
        this._clickOutsideId = null;

        if (this._menu) {
            Main.uiGroup.remove_actor(this._menu);
            this._menu.destroy();
            this._menu = null;
        }
    }
};
