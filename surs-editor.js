/**
 * SURS Pro 3.9.7: deferred shelf editor module.
 * Loaded on demand by surs.js from the exact same repository revision.
 */
(function(window) {
    'use strict';
    window.__SURS_EDITOR_FACTORY_397 = function(deps) {
        var escapeHtml = deps.escapeHtml;
        var getAllAvailableShelves = deps.getAllAvailableShelves;
        var getShelfCategory = deps.getShelfCategory;
        var getShelfDesc = deps.getShelfDesc;
        var getBadgeHtml = deps.getBadgeHtml;
        var getBadgePrefix = deps.getBadgePrefix;
        var runAutoDiscovery = deps.runAutoDiscovery;
        var normalizeShelfScope = deps.normalizeShelfScope;
        var shelfScopeTitle = deps.shelfScopeTitle;
        var activeShelfScope = deps.activeShelfScope;
        var executeBulletproofReset = deps.executeBulletproofReset;
        var refreshSursHome = deps.refreshSursHome;
        var getSavedShelves = deps.getSavedShelves;
        var saveShelves = deps.saveShelves;

    // Defer modal-only CSS parsing until the editor is requested.
    function addEditorStyles() {
        if ($('#surs-editor-styles').length) return;
        var style = $(`
            <style id="surs-editor-styles">
                /* SURS 3.9: isolated shelf editor design tokens and responsive layout */
                .modal.surs-sm-modal {
                    --sm-bg: #171a20;
                    --sm-card: #23272f;
                    --sm-border: rgba(255,255,255,0.12);
                    --sm-muted: #a8b1bf;
                    --sm-accent: #418ac4;
                    --sm-radius: 12px;
                    --sm-gap: 8px;
                }
                .modal.surs-sm-modal .modal__content {
                    width: min(960px, 95vw) !important;
                    max-width: 960px !important;
                    padding: 0 !important;
                    background: var(--sm-bg) !important;
                    border-radius: 16px !important;
                    overflow: hidden;
                    box-sizing: border-box;
                }
                .modal.surs-sm-modal .modal__body,
                .modal.surs-sm-modal .modal__body > .scroll,
                .modal.surs-sm-modal .modal__body > .scroll > .scroll__content,
                .modal.surs-sm-modal .modal__body .scroll__body {
                    width: 100%;
                    min-width: 0;
                    min-height: 0;
                    box-sizing: border-box;
                }
                .modal.surs-sm-modal .modal__body > .scroll > .scroll__content {
                    max-height: none !important;
                    padding: 0 !important;
                }
                .modal.surs-sm-modal .modal__body .scroll__body {
                    transform: none !important;
                }
                .modal.surs-sm-modal .surs-sm-wrap {
                    width: 100% !important;
                    max-width: 100% !important;
                    height: min(85dvh, 820px);
                    height: min(85vh, 820px);
                    padding: 18px 20px 0 !important;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    overflow: hidden;
                    box-sizing: border-box;
                }
                @supports (height: 85dvh) {
                    .modal.surs-sm-modal .surs-sm-wrap { height: min(85dvh, 820px); }
                }
                .surs-sm-header {
                    flex: 0 0 auto;
                    align-items: center;
                    margin-bottom: 10px !important;
                    padding-bottom: 12px !important;
                    gap: 12px !important;
                }
                .surs-sm-title-group { align-items: center !important; gap: 10px !important; }
                .surs-sm-title { font-size: 21px !important; line-height: 1.25; }
                .surs-sm-version { font-size: 12px; color: var(--sm-muted); font-weight: 400; }
                .surs-sm-counter { font-size: 12px !important; padding: 3px 9px !important; }
                .surs-sm-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-shrink: 0; }
                .surs-sm-search-field {
                    flex: 1 1 160px;
                    height: 44px;
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    border: 1px solid var(--sm-border);
                    border-radius: 10px;
                    background: rgba(255,255,255,0.06);
                    box-sizing: border-box;
                    padding: 0 12px;
                }
                .surs-sm-search-icon { color: var(--sm-muted); margin-right: 8px; font-size: 18px; }
                .surs-sm-search-input {
                    background: transparent; border: 0; outline: none;
                    color: #fff; width: 100%; min-width: 0;
                    font-size: 14px; font-family: inherit;
                }
                .surs-sm-search-input::placeholder { color: var(--sm-muted); opacity: 0.9; }
                .surs-sm-search-trigger, .surs-sm-toolbar-btn, .surs-sm-header-btn {
                    min-height: 44px; min-width: 44px;
                    display: inline-flex; align-items: center; justify-content: center;
                    border: 1px solid var(--sm-border);
                    background: rgba(255,255,255,0.07);
                    color: #fff; border-radius: 10px;
                    box-sizing: border-box; font-size: 14px;
                    padding: 0 12px; cursor: pointer;
                }
                .surs-sm-search-trigger { display: none; }
                .surs-sm-header-btn { display: none; }
                .surs-sm-toolbar-btn.focus, .surs-sm-header-btn.focus,
                .surs-sm-search-trigger.focus {
                    outline: 2px solid #8ec8ff;
                    outline-offset: -2px;
                }
                .surs-sm-tabs {
                    margin-bottom: 0 !important;
                    padding-bottom: 4px !important;
                    gap: 6px !important;
                    flex: 1 1 auto;
                    min-width: 0;
                }
                .surs-sm-tab {
                    min-height: 44px !important;
                    display: inline-flex;
                    align-items: center;
                    box-sizing: border-box;
                    padding: 0 13px !important;
                    border-radius: 10px !important;
                    font-size: 13px !important;
                    transform: none !important;
                }
                .surs-sm-list {
                    flex: 1 1 0;
                    min-height: 0;
                    max-height: none !important;
                    overflow-x: hidden;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    padding: 0 3px 6px 0 !important;
                    margin: 0 !important;
                    scroll-behavior: auto !important;
                }
                .surs-sm-list-heading {
                    display: flex; align-items: center; justify-content: space-between;
                    color: var(--sm-muted); font-size: 12px; line-height: 18px;
                    margin: 2px 0 8px; flex-shrink: 0;
                }
                .surs-sm-item {
                    padding: 11px 12px !important;
                    margin-bottom: var(--sm-gap) !important;
                    background: var(--sm-card) !important;
                    border-radius: var(--sm-radius) !important;
                    border: 1px solid var(--sm-border) !important;
                    min-height: 76px; gap: 10px;
                    box-sizing: border-box;
                }
                .surs-sm-item--disabled { opacity: 0.78 !important; }
                .surs-sm-info { min-width: 0; margin-right: 0 !important; }
                .surs-sm-title-line { gap: 5px 8px !important; align-items: center; }
                .surs-sm-name {
                    font-size: 15px !important; line-height: 1.35 !important;
                    font-weight: 600 !important; white-space: normal !important;
                    overflow-wrap: anywhere !important;
                    max-height: none !important;
                }
                .surs-sm-desc {
                    font-size: 12px !important; line-height: 1.35 !important;
                    color: var(--sm-muted) !important;
                    margin-top: 4px !important;
                    white-space: normal !important;
                    max-height: 2.8em;
                    overflow: hidden;
                }
                .surs-sm-badge { font-size: 10px !important; line-height: 1.25; }
                .surs-sm-drag-handle {
                    min-width: 44px !important; width: 44px !important;
                    min-height: 44px !important; height: 44px !important;
                    margin: 0 !important; flex: 0 0 44px;
                }
                .surs-sm-drag-handle svg { width: 20px; height: 20px; }
                .surs-sm-actions { gap: 8px !important; margin-left: auto; }
                .surs-sm-toggle {
                    min-height: 44px !important; height: 44px !important;
                    min-width: 78px !important; display: inline-flex;
                    justify-content: center; align-items: center;
                    padding: 0 8px !important; font-size: 13px !important;
                    line-height: 1.2 !important;
                    border-radius: 9px !important;
                }
                .surs-sm-navbtn--more { width: 44px !important; min-width: 44px !important; height: 44px !important; }
                .surs-sm-footer {
                    flex: 0 0 auto;
                    display: flex !important; flex-direction: row !important;
                    padding: 12px 0 14px !important;
                    margin: 0 !important;
                    border-top: 1px solid var(--sm-border);
                    background: var(--sm-bg);
                    gap: 10px !important;
                    align-items: center;
                }
                .surs-sm-footer-left, .surs-sm-footer-right {
                    display: flex !important; flex-wrap: nowrap !important;
                    align-items: center; gap: 8px !important;
                    min-width: 0; width: auto !important;
                }
                .surs-sm-footer-left { flex: 1 1 auto; }
                .surs-sm-footer-right { flex: 0 0 auto; }
                .surs-sm-btn {
                    min-height: 44px !important; box-sizing: border-box;
                    padding: 10px 14px !important; border-radius: 10px !important;
                    font-size: 14px !important; line-height: 1.2 !important;
                    transform: none !important;
                }
                .surs-sm-btn--inactive {
                    opacity: 0.5; box-shadow: none !important;
                }
                .surs-sm-row-filtered { display: none !important; }
                .surs-sm-empty-search {
                    display: none; padding: 22px 12px;
                    color: var(--sm-muted); text-align: center;
                    font-size: 14px;
                }
                .surs-sm-item--dragging { transform: scale(0.985) !important; opacity: 0.65 !important; }
                .surs-sm-item--drag-over { border-top: 3px solid #8ec8ff !important; transform: none !important; }
                .surs-sm-item.focus { border-color: #80befa !important; outline: 2px solid rgba(128,190,250,.65); outline-offset: -2px; }

                /* Tablet: centered editing surface, not a bottom sheet. */
                @media screen and (min-width: 701px) and (max-width: 1100px) {
                    .modal.surs-sm-modal .modal__content { width: min(820px, 94vw) !important; }
                    .modal.surs-sm-modal .surs-sm-wrap { height: 88vh; padding: 16px 18px 0 !important; }
                    .surs-sm-item { min-height: 78px; }
                }
                /* Mobile only: touch-aware fullscreen editor, fixed header/footer. */
                @media screen and (max-width: 700px) {
                    .modal.surs-sm-modal.surs-sm--touch {
                        padding: 0 !important; background: #15181d !important;
                        backdrop-filter: none !important;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .modal__content {
                        position: fixed !important;
                        top: 0 !important; bottom: 0 !important;
                        left: 0 !important; right: 0 !important;
                        width: 100vw !important; max-width: 100vw !important;
                        height: 100vh !important; height: 100dvh !important;
                        border-radius: 0 !important; padding: 0 !important;
                        display: flex; flex-direction: column;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .modal__body,
                    .modal.surs-sm-modal.surs-sm--touch .modal__body > .scroll,
                    .modal.surs-sm-modal.surs-sm--touch .modal__body > .scroll > .scroll__content,
                    .modal.surs-sm-modal.surs-sm--touch .modal__body .scroll__body {
                        height: 100% !important;
                        display: flex !important; flex-direction: column;
                        flex: 1 1 0; min-height: 0;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-wrap {
                        height: 100% !important; max-height: none !important;
                        padding: max(12px, env(safe-area-inset-top, 0px)) 14px 0 !important;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-header {
                        margin-bottom: 10px !important; padding-bottom: 10px !important;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-title { font-size: 20px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-version { font-size: 11px; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-title-group { flex: 1 1 auto; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-header-btn { display: inline-flex; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-legend { display: none !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-counter { white-space: nowrap; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-toolbar { flex-wrap: wrap; gap: 8px; }
                    /* Every category stays visible inside one swipeable horizontal rail. */
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-tabs {
                        display: flex !important;
                        flex: 0 0 100% !important;
                        width: 100% !important;
                        max-width: 100%;
                        min-width: 0;
                        gap: 6px !important;
                        padding: 0 2px 5px !important;
                        margin: 0 !important;
                        overflow-x: auto !important;
                        overflow-y: hidden !important;
                        -webkit-overflow-scrolling: touch;
                        overscroll-behavior-x: contain;
                        touch-action: pan-x;
                        scroll-snap-type: x proximity;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-tab {
                        display: inline-flex !important;
                        flex: 0 0 auto !important;
                        justify-content: center;
                        min-width: 0 !important;
                        min-height: 44px !important;
                        padding: 0 13px !important;
                        font-size: 13px !important;
                        white-space: nowrap;
                        scroll-snap-align: start;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-toolbar-btn { min-width: 44px; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-search-field {
                        flex: 1 0 100%; order: 2;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-list-heading { margin-bottom: 6px; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-item { padding: 10px 8px !important; min-height: 76px; gap: 8px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-name { font-size: 15px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-drag-handle { width: 44px !important; min-width: 44px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-actions { gap: 4px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-navbtn--step,
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-navbtn--top { display: none !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-toggle {
                        min-width: 48px !important; width: 48px !important;
                        height: 44px !important; border: none !important;
                        background: transparent !important; font-size: 0 !important;
                        position: relative; overflow: hidden;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-toggle:before {
                        content: ''; width: 42px; height: 26px;
                        border-radius: 20px; background: #4a515c;
                        position: absolute; top: 9px; left: 3px;
                        transition: background 120ms ease;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-toggle:after {
                        content: ''; width: 20px; height: 20px;
                        border-radius: 100%; background: #eee;
                        position: absolute; top: 12px; left: 6px;
                        transition: transform 120ms ease;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-toggle.active:before { background: #2f9566; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-toggle.active:after { transform: translateX(16px); }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-navbtn--more { min-width: 44px !important; width: 44px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer {
                        padding: 10px 0 max(12px, env(safe-area-inset-bottom, 0px)) !important;
                        flex-direction: row !important; gap: 8px !important;
                        width: 100%; box-sizing: border-box;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer-left,
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer-right {
                        flex: 1 1 0; width: 50% !important;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer [data-action="add"],
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer [data-action="apply"] {
                        display: inline-flex !important; width: 100%;
                        min-width: 0 !important; justify-content: center;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer [data-action="rescan"],
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer [data-action="search"],
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer [data-action="reset"],
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer [data-action="cancel"],
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-footer [data-action="hide-all-plugins"] {
                        display: none !important;
                    }
                }
                @media screen and (max-width: 365px) {
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-wrap { padding-left: 10px !important; padding-right: 10px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-item { gap: 4px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-drag-handle { width: 38px !important; min-width: 38px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-navbtn--more { width: 40px !important; min-width: 40px !important; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .modal.surs-sm-modal .surs-sm-item,
                    .modal.surs-sm-modal .surs-sm-toggle { transition: none !important; }
                }

                /* Search and categories for different input methods. */
                /* Categories are shown as chips; no separate category picker. */
                .modal.surs-sm-modal.surs-sm--tv .surs-sm-search-field { display: none; }
                .modal.surs-sm-modal.surs-sm--tv .surs-sm-search-trigger { display: inline-flex; }
                .modal.surs-sm-modal.surs-sm--tv .surs-sm-toolbar { justify-content: space-between; }
                .modal.surs-sm-modal.surs-sm--tv .surs-sm-tab.focus,
                .modal.surs-sm-modal.surs-sm--tv .surs-sm-btn.focus,
                .modal.surs-sm-modal.surs-sm--tv .surs-sm-toggle.focus {
                    outline: 3px solid #9ad3ff !important;
                    outline-offset: -2px !important;
                    transform: none !important;
                }
                @media screen and (max-width: 700px) {
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-search-field { display: flex; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-title-group {
                        min-width: 0; flex-wrap: wrap; gap: 3px 8px !important;
                    }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-counter { font-size: 11px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-list-heading span:last-child { display: none; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-title { max-width: 100%; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-header { flex-wrap: nowrap; }
                }
                @media screen and (max-width: 440px) {
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-title { font-size: 18px !important; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-header-btn { padding: 0 8px; }
                }

                /* Independent screen profiles; category chips remain below. */
                .modal.surs-sm-modal .surs-sm-screen-tabs {
                    display: flex; flex: 0 0 auto; width: 100%; min-width: 0;
                    align-items: stretch; gap: 8px; padding: 0 0 12px;
                    margin: 0 0 10px; border-bottom: 1px solid var(--sm-border);
                    overflow-x: auto; -webkit-overflow-scrolling: touch;
                    scrollbar-width: none; overscroll-behavior-x: contain;
                }
                .modal.surs-sm-modal .surs-sm-screen-tabs::-webkit-scrollbar { display: none; }
                .modal.surs-sm-modal .surs-sm-screen-tab {
                    display: inline-flex; flex: 1 1 0; min-width: 0;
                    min-height: 44px; padding: 8px 10px; box-sizing: border-box;
                    align-items: center; justify-content: center; text-align: center;
                    border-radius: 10px; background: rgba(255,255,255,.06);
                    border: 1px solid var(--sm-border); color: var(--sm-muted);
                    font-size: 13px; font-weight: 600; line-height: 1.2;
                    cursor: pointer;
                }
                .modal.surs-sm-modal .surs-sm-screen-tab.active {
                    color: #fff; background: rgba(65,138,196,.4); border-color: #6eb4e9;
                }
                .modal.surs-sm-modal .surs-sm-screen-tab.focus {
                    outline: 2px solid #9ad3ff; outline-offset: -2px;
                }
                @media screen and (max-width: 700px) {
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-screen-tabs { gap: 5px; }
                    .modal.surs-sm-modal.surs-sm--touch .surs-sm-screen-tab {
                        font-size: 12px; padding: 7px 5px; min-height: 44px;
                    }
                }
            </style>
        `);
        $('body').append(style);
    }


    var isModalOpen = false;

    function openShelfManagerModal(scope) {
        addEditorStyles();
        if (isModalOpen) {
            try { Lampa.Modal.close(); } catch(e){}
            isModalOpen = false;
        }
        isModalOpen = true;

        var prevController = (Lampa.Controller && Lampa.Controller.enabled) ? Lampa.Controller.enabled().name : 'content';
        // Редактор работает с копией; изменения сохраняются только после «Применить».
        var editorScope = normalizeShelfScope(scope || activeShelfScope());
        var shelves = getSavedShelves(editorScope).map(function(item) { return Object.assign({}, item); });
        var activeCategory = 'enabled';
        var searchQuery = '';
        var modalHtml = null;
        var originalShelvesSnapshot = JSON.stringify(shelves);
        var editorPlatform = {
            tv: false,
            touch: false
        };
        try {
            editorPlatform.tv = !!(Lampa.Platform && Lampa.Platform.screen && Lampa.Platform.screen('tv'));
            editorPlatform.touch = !editorPlatform.tv && !!(
                (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                (window.navigator && window.navigator.maxTouchPoints > 0)
            );
        } catch(e) {}

        function hasUnsavedChanges() {
            return JSON.stringify(shelves) !== originalShelvesSnapshot;
        }
        function updateApplyState() {
            if (!modalHtml) return;
            modalHtml.find('[data-action="apply"]')
                .toggleClass('surs-sm-btn--inactive', !hasUnsavedChanges())
                .attr('aria-disabled', hasUnsavedChanges() ? 'false' : 'true');
        }
        function applyAndClose() {
            if (hasUnsavedChanges()) {
                if (!saveShelves(shelves, editorScope)) return;
                if (needsPluginMigration && editorScope === 'MAIN') Lampa.Storage.set(migrationKey, 'true');
            }
            closeModalSafely(hasUnsavedChanges());
        }
        function requestCloseEditor() {
            if (!hasUnsavedChanges()) { closeModalSafely(false); return; }
            Lampa.Select.show({
                title: 'Есть несохранённые изменения',
                items: [
                    { title: '✓ Сохранить и выйти', action: 'save' },
                    { title: 'Выйти без сохранения', action: 'discard' },
                    { title: 'Продолжить редактирование', action: 'continue' }
                ],
                onSelect: function(choice) {
                    if (choice.action === 'save') applyAndClose();
                    else if (choice.action === 'discard') closeModalSafely(false);
                    else Lampa.Controller.toggle('surs_shelf_manager');
                },
                onBack: function() { Lampa.Controller.toggle('surs_shelf_manager'); }
            });
        }


        // Миграция: сторонние плагинные полки по умолчанию выключены, пользователь включает только нужные
        var migrationKey = 'surs_plugins_default_off_v2';
        var needsPluginMigration = editorScope === 'MAIN' && !Lampa.Storage.get(migrationKey);
        if (needsPluginMigration) {
            shelves.forEach(function(s) {
                var cat = getShelfCategory(s.id);
                if (cat === 'plugin' || cat === 'trakt' || (s.id && s.id.indexOf('ext_') === 0)) {
                    s.enabled = false;
                }
            });
        }

        originalShelvesSnapshot = JSON.stringify(shelves);

        function switchEditorScope(nextScope) {
            var selected = normalizeShelfScope(nextScope);
            if (selected === editorScope) return;
            function activate() {
                editorScope = selected;
                shelves = getSavedShelves(editorScope).map(function(item) { return Object.assign({}, item); });
                originalShelvesSnapshot = JSON.stringify(shelves);
                needsPluginMigration = editorScope === 'MAIN' && !Lampa.Storage.get(migrationKey);
                activeCategory = 'enabled';
                searchQuery = '';
                refreshListFocus(null, 'tab');
            }
            if (!hasUnsavedChanges()) { activate(); return; }
            Lampa.Select.show({
                title: 'Изменения в разделе «' + shelfScopeTitle(editorScope) + '»',
                items: [
                    {title: '✓ Сохранить и перейти', action: 'save'},
                    {title: 'Перейти без сохранения', action: 'discard'},
                    {title: 'Остаться в разделе', action: 'cancel'}
                ],
                onSelect: function(choice) {
                    if (choice.action === 'save') {
                        if (!saveShelves(shelves, editorScope)) {
                            Lampa.Controller.toggle('surs_shelf_manager');
                            return;
                        }
                        if (needsPluginMigration && editorScope === 'MAIN')
                            Lampa.Storage.set(migrationKey, 'true');
                        activate();
                    } else if (choice.action === 'discard') activate();
                    else Lampa.Controller.toggle('surs_shelf_manager');
                },
                onBack: function() { Lampa.Controller.toggle('surs_shelf_manager'); }
            });
        }

        function closeModalSafely(needRefresh) {
            isModalOpen = false;
            try { Lampa.Modal.close(); } catch(e) {}

            // Всегда восстанавливаем базовый контроллер, чтобы пульт ТВ не зависал в воздухе
            try {
                Lampa.Controller.toggle(prevController || 'content');
            } catch(e) {}

            if (needRefresh) {
                Lampa.Noty.show('Порядок полок сохранён и применён!');
                refreshSursHome(editorScope);
            }
        }

        function openShelfActionMenu(item, idx) {
            Lampa.Select.show({
                title: item.title,
                items: [
                    { title: item.enabled ? '✕ Скрыть полку с экрана' : '✓ Включить показ полки', action: 'toggle' },
                    { title: '⤒ В самый верх (на 1-е место)', action: 'top' },
                    { title: '▲ На 1 позицию выше', action: 'up' },
                    { title: '▼ На 1 позицию ниже', action: 'down' },
                    { title: '⤓ В самый низ списка', action: 'bottom' },
                    { title: '🗑 Убрать полку из активного списка', action: 'remove' }
                ],
                onSelect: function(a) {
                    if (a.action === 'toggle') {
                        item.enabled = !item.enabled;
                        refreshListFocus(item.id, 'toggle');
                    } else if (a.action === 'top') {
                        if (idx > 0) {
                            var moved = shelves.splice(idx, 1)[0];
                            shelves.unshift(moved);
                            refreshListFocus(item.id, 'top');
                            Lampa.Noty.show('Полка «' + moved.title + '» перемещена на 1-е место!');
                        }
                    } else if (a.action === 'up') {
                        if (idx > 0) {
                            var temp = shelves[idx - 1];
                            shelves[idx - 1] = shelves[idx];
                            shelves[idx] = temp;
                            refreshListFocus(item.id, 'up');
                            Lampa.Noty.show('Полка «' + item.title + '» поднята выше');
                        }
                    } else if (a.action === 'down') {
                        if (idx < shelves.length - 1) {
                            var temp = shelves[idx + 1];
                            shelves[idx + 1] = shelves[idx];
                            shelves[idx] = temp;
                            refreshListFocus(item.id, 'down');
                            Lampa.Noty.show('Полка «' + item.title + '» опущена ниже');
                        }
                    } else if (a.action === 'bottom') {
                        if (idx < shelves.length - 1) {
                            var movedBottom = shelves.splice(idx, 1)[0];
                            shelves.push(movedBottom);
                            refreshListFocus(item.id, 'down');
                            Lampa.Noty.show('Полка «' + movedBottom.title + '» перемещена в самый низ');
                        }
                    } else if (a.action === 'remove') {
                        var removed = shelves.splice(idx, 1)[0];
                        refreshListFocus(null, 'remove');
                        Lampa.Noty.show('Полка «' + removed.title + '» убрана из списка');
                    }
                },
                onBack: function() {
                    Lampa.Controller.toggle('surs_shelf_manager');
                }
            });
        }

        function renderModalContent() {
            var modalHtml = $('<div class="surs-sm-wrap"></div>');

            var enabledCount = shelves.filter(function(s){ return s.enabled; }).length;

            var header = $(`
                <div class="surs-sm-header">
                    <div class="surs-sm-title-group">
                        <div class="surs-sm-title">Полки: ${shelfScopeTitle(editorScope)} <span class="surs-sm-version">v3.9.6</span></div>
                        <div class="surs-sm-counter">${enabledCount} / ${shelves.length}</div>
                    </div>
                    <div class="surs-sm-legend">Пульт: ↑/↓ порядок · OK выбор · ≡ действия</div>
                    <div class="surs-sm-header-btn selector" data-action="back" role="button" aria-label="Закрыть редактор">✕</div>
                    <div class="surs-sm-header-btn selector" data-action="options" role="button" aria-label="Дополнительные действия">⋯</div>
                </div>
            `);
            modalHtml.append(header);
            header.find('[data-action="back"]').on('hover:enter click', function(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                requestCloseEditor();
            });
            header.find('[data-action="options"]').on('hover:enter click', function(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                Lampa.Select.show({
                    title: 'Действия с полками',
                    items: [
                        { title: 'Обновить источники', action: 'rescan' },
                        { title: 'Сбросить порядок полок', action: 'reset' },
                        { title: 'Скрыть все сторонние полки', action: 'hide-all-plugins' }
                    ],
                    onSelect: function(choice) {
                        if (choice.action === 'hide-all-plugins') {
                            var changed = 0;
                            shelves.forEach(function(sh) {
                                var type = getShelfCategory(sh.id);
                                if ((type === 'plugin' || type === 'trakt' ||
                                     sh.cat === 'plugin' || sh.cat === 'trakt' ||
                                     /^ext_|^cr_/.test(sh.id || '')) && sh.enabled) {
                                    sh.enabled = false; changed++;
                                }
                            });
                            refreshListFocus(null, 'tab');
                            Lampa.Noty.show('Скрыто сторонних полок: ' + changed);
                        } else {
                            var target = modalHtml.find('.surs-sm-footer [data-action="' + choice.action + '"]');
                            if (target.length) target.trigger('click');
                        }
                    },
                    onBack: function() { Lampa.Controller.toggle('surs_shelf_manager'); }
                });
            });

            // Main / World / Russia are separate storage scopes. Categories below
            // filter only the currently selected section.
            var scopeTabs = $('<div class="surs-sm-screen-tabs" role="tablist" aria-label="Настраиваемый экран"></div>');
            [
                {id:'MAIN', title:'Главная'},
                {id:'NEW', title:'Новинки Мир'},
                {id:'RUS', title:'Новинки Россия'}
            ].forEach(function(profile) {
                var tab = $('<div class="surs-sm-screen-tab selector ' +
                    (editorScope === profile.id ? 'active' : '') +
                    '" data-surs-screen="' + profile.id + '" role="tab" aria-selected="' +
                    (editorScope === profile.id ? 'true' : 'false') + '">' +
                    profile.title + '</div>');
                tab.on('hover:enter click', function(e) {
                    if (e && e.stopPropagation) e.stopPropagation();
                    switchEditorScope(profile.id);
                });
                scopeTabs.append(tab);
            });
            modalHtml.append(scopeTabs);

            // Панель вкладок категорий
            var catTabs = [
                { id: 'all', title: 'Все' },
                { id: 'enabled', title: 'Активные' },
                { id: 'hidden', title: 'Скрытые' },
                { id: 'surs', title: 'SURS' },
                { id: 'core', title: 'Lampa Core' },
                { id: 'plugin', title: 'Плагины' },
                { id: 'streaming', title: 'Стриминги' },
                { id: 'genre', title: 'Жанры' }
            ];

            var tabsWrap = $('<div class="surs-sm-tabs"></div>');
            catTabs.forEach(function(t) {
                var tabBtn = $('<div class="surs-sm-tab selector ' + (activeCategory === t.id ? 'active' : '') + '" data-cat="' + t.id + '">' + t.title + '</div>');
                tabBtn.on('hover:enter click', function(e) {
                    if (e && e.stopPropagation) e.stopPropagation();
                    activeCategory = t.id;
                    refreshListFocus(null, 'tab');
                });
                tabsWrap.append(tabBtn);
            });
            var toolbar = $('<div class="surs-sm-toolbar"></div>');
            toolbar.append(tabsWrap);
            var searchField = $('<div class="surs-sm-search-field"></div>');
            var searchInput = $('<input type="search" class="surs-sm-search-input" placeholder="Найти полку..." aria-label="Поиск полок" autocomplete="off">');
            searchInput.val(searchQuery);
            searchInput.on('input', function() {
                searchQuery = String($(this).val() || '');
                filterVisibleRows();
            });
            searchField.append($('<span class="surs-sm-search-icon">⌕</span>')).append(searchInput);
            toolbar.append(searchField);
            var tvSearch = $('<div class="surs-sm-search-trigger selector" data-action="search" role="button">Поиск</div>');
            tvSearch.on('hover:enter click', function(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                openSearchKeyboard();
            });
            toolbar.append(tvSearch);
            modalHtml.append(toolbar);

            var listHeading = $('<div class="surs-sm-list-heading"><span>Порядок отображения</span><span>Удерживайте ≡ для перемещения</span></div>');
            modalHtml.append(listHeading);
            var list = $('<div class="surs-sm-list"></div>');

            var displayEntries = shelves.map(function(item, idx) {
                return { item: item, originalIndex: idx };
            }).filter(function(entry) {
                // Live search filters existing rows without rebuilding the input and losing focus.
                if (activeCategory === 'all') return true;
                if (activeCategory === 'enabled') return !!entry.item.enabled;
                if (activeCategory === 'hidden') return !entry.item.enabled;
                var cat = getShelfCategory(entry.item.id);
                if (activeCategory === 'surs') return cat === 'surs' || cat === 'nav' || cat === 'icons' || cat === 'feed';
                if (activeCategory === 'core') return cat === 'core';
                if (activeCategory === 'plugin') return cat === 'plugin' || cat === 'trakt';
                if (activeCategory === 'streaming') return cat === 'streaming';
                if (activeCategory === 'genre') return cat === 'genre' || cat === 'regional' || cat === 'period';
                return true;
            });

            if (!displayEntries.length) {
                if (activeCategory === 'plugin' && !searchQuery) {
                    list.append('<div style="text-align:center;padding:2em;color:rgba(255,255,255,0.4);">Сторонние плагины не добавлены.<br>Нажмите кнопку <b>«🔄 Найти плагины»</b> внизу для автоматического поиска установленных плагинов.</div>');
                } else {
                    list.append('<div style="text-align:center;padding:2em;color:rgba(255,255,255,0.4);">Нет активных полок в этой категории. Нажмите <b>«+ Добавить полку»</b> ниже.</div>');
                }
            }

            displayEntries.forEach(function(entry) {
                var item = entry.item;
                var idx = entry.originalIndex;
                var cat = getShelfCategory(item.id);
                var desc = item.desc || getShelfDesc(item.id);
                var live = window.SURS_EXTERNAL_SHELVES[item.id];
                var unavailable = (/^ext_/.test(item.id) || /^hdrezka_/i.test(item.id)) && !/^ext_Trakt/.test(item.id) &&
                    (!live || (typeof live.loader !== 'function' && typeof live.call !== 'function'));
                if (unavailable) desc = 'Источник недоступен: исходный плагин не зарегистрирован';
                else if (item.enabled) {
                    var runtime = window.SURS_SHELF_STATUS[item.id];
                    var labels = { timeout: 'Таймаут', error: 'Ошибка загрузки', empty: 'Нет контента' };
                    if (runtime && labels[runtime.state]) desc = (desc ? desc + ' · ' : '') + labels[runtime.state];
                }
                var badgeHtml = getBadgeHtml(cat);
                var isFirst = (idx === 0);
                var isLast = (idx === shelves.length - 1);

                var row = $(`
                    <div class="surs-sm-item ${item.enabled ? '' : 'surs-sm-item--disabled'} ${unavailable ? 'surs-sm-item--unavailable' : ''}" data-id="${escapeHtml(item.id)}" draggable="${editorPlatform.touch ? 'false' : 'true'}">
                        <div class="surs-sm-drag-handle selector" data-action="handle" title="Зажмите для перетаскивания или нажмите для меню порядка">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2Z"/></svg>
                        </div>
                        <div class="surs-sm-info">
                            <div class="surs-sm-title-line">
                                ${badgeHtml}
                                <span class="surs-sm-name">${escapeHtml(item.title)}</span>
                            </div>
                            ${desc ? '<div class="surs-sm-desc">' + escapeHtml(desc) + '</div>' : ''}
                        </div>
                        <div class="surs-sm-actions">
                            <div class="surs-sm-toggle selector ${item.enabled ? 'active' : ''}" role="button" aria-pressed="${item.enabled ? 'true' : 'false'}" aria-label="${escapeHtml(item.title)}: ${item.enabled ? 'показана' : 'скрыта'}" data-action="toggle" title="Включить или скрыть полку">
                                ${item.enabled ? '✓ Вкл' : '✕ Скрыто'}
                            </div>
                            <div class="surs-sm-navbtn surs-sm-navbtn--step surs-sm-navbtn--up selector ${isFirst ? 'surs-sm-navbtn--disabled' : ''}" data-action="up" title="Поднять на 1 позицию выше">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
                            </div>
                            <div class="surs-sm-navbtn surs-sm-navbtn--step surs-sm-navbtn--down selector ${isLast ? 'surs-sm-navbtn--disabled' : ''}" data-action="down" title="Опустить на 1 позицию ниже">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                            </div>
                            <div class="surs-sm-navbtn surs-sm-navbtn--top selector ${isFirst ? 'surs-sm-navbtn--disabled' : ''}" data-action="top" title="В самый верх (на 1-е место)">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="display:inline-block;vertical-align:-1px;margin-right:2px;pointer-events:none;"><path d="M4 4h16v2.5H4zm8 3.5l7 7h-4.5v6h-5v-6H6z"/></svg><span>В топ</span>
                            </div>
                            <div class="surs-sm-navbtn surs-sm-navbtn--more selector" data-action="more" title="Все действия (вверх, вниз, в низ, скрыть)">···</div>
                        </div>
                    </div>
                `);

                // Клик или OK по иконке перетаскивания (три полоски)
                row.data('surs-search', ((item.title || '') + ' ' + (desc || '') + ' ' + item.id).toLowerCase());
                row.find('.surs-sm-drag-handle').on('hover:enter click', function(e) {
                    e.stopPropagation();
                    openShelfActionMenu(item, idx);
                });

                // Переключение видимости
                row.find('[data-action="toggle"]').on('hover:enter click', function(e) {
                    if (e && e.stopPropagation) e.stopPropagation();
                    item.enabled = !item.enabled;
                    row.toggleClass('surs-sm-item--disabled', !item.enabled);
                    row.find('[data-action="toggle"]').toggleClass('active', !!item.enabled)
                        .attr('aria-pressed', item.enabled ? 'true' : 'false')
                        .attr('aria-label', item.title + ': ' + (item.enabled ? 'показана' : 'скрыта'))
                        .text(item.enabled ? '✓ Вкл' : '✕ Скрыто');
                    modalHtml.find('.surs-sm-counter').text(
                        shelves.filter(function(sh) { return sh.enabled; }).length + ' / ' + shelves.length
                    );
                    if (activeCategory === 'enabled' || activeCategory === 'hidden') {
                        var needle = searchQuery.trim().toLowerCase();
                        var future = shelves.filter(function(sh) {
                            var inTab = activeCategory === 'enabled' ? sh.enabled : !sh.enabled;
                            if (!inTab || !needle) return inTab;
                            var desc = sh.desc || getShelfDesc(sh.id);
                            return ((sh.title || '') + ' ' + (desc || '') + ' ' + sh.id)
                                .toLowerCase().indexOf(needle) !== -1;
                        });
                        var closest = future.reduce(function(best, sh) {
                            var distance = Math.abs(shelves.indexOf(sh) - idx);
                            return !best || distance < best.distance ? {id: sh.id, distance: distance} : best;
                        }, null);
                        refreshListFocus(closest ? closest.id : null, 'toggle');
                    } else {
                        updateApplyState();
                    }
                });

                // Перемещение на 1 позицию выше (▲)
                row.find('[data-action="up"]').on('hover:enter click', function(e) {
                    e.stopPropagation();
                    if (idx > 0) {
                        var temp = shelves[idx - 1];
                        shelves[idx - 1] = shelves[idx];
                        shelves[idx] = temp;
                        refreshListFocus(item.id, 'up');
                        Lampa.Noty.show('Полка «' + item.title + '» поднята выше');
                    }
                });

                // Перемещение на 1 позицию ниже (▼)
                row.find('[data-action="down"]').on('hover:enter click', function(e) {
                    e.stopPropagation();
                    if (idx < shelves.length - 1) {
                        var temp = shelves[idx + 1];
                        shelves[idx + 1] = shelves[idx];
                        shelves[idx] = temp;
                        refreshListFocus(item.id, 'down');
                        Lampa.Noty.show('Полка «' + item.title + '» опущена ниже');
                    }
                });

                // Перемещение в самый верх списка (на 1-е место)
                row.find('[data-action="top"]').on('hover:enter click', function(e) {
                    e.stopPropagation();
                    if (idx > 0) {
                        var moved = shelves.splice(idx, 1)[0];
                        shelves.unshift(moved);
                        refreshListFocus(item.id, 'top');
                        Lampa.Noty.show('Полка «' + moved.title + '» перемещена на 1-е место!');
                    }
                });

                // Меню дополнительных действий (···)
                row.find('[data-action="more"]').on('hover:enter click', function(e) {
                    e.stopPropagation();
                    openShelfActionMenu(item, idx);
                });

                // Drag & Drop мышкой (HTML5 Drag and Drop)
                row.on('dragstart', function(e) {
                    if (e.originalEvent && e.originalEvent.dataTransfer) {
                        e.originalEvent.dataTransfer.effectAllowed = 'move';
                        e.originalEvent.dataTransfer.setData('text/plain', item.id);
                    }
                    row.addClass('surs-sm-item--dragging');
                });

                row.on('dragover', function(e) {
                    e.preventDefault();
                    if (e.originalEvent && e.originalEvent.dataTransfer) {
                        e.originalEvent.dataTransfer.dropEffect = 'move';
                    }
                    $('.surs-sm-item--drag-over').removeClass('surs-sm-item--drag-over');
                    row.addClass('surs-sm-item--drag-over');
                });

                row.on('dragleave', function(e) {
                    row.removeClass('surs-sm-item--drag-over');
                });

                row.on('drop', function(e) {
                    e.preventDefault();
                    row.removeClass('surs-sm-item--drag-over');
                    $('.surs-sm-item--dragging').removeClass('surs-sm-item--dragging');

                    var sourceId = (e.originalEvent && e.originalEvent.dataTransfer) ? e.originalEvent.dataTransfer.getData('text/plain') : null;
                    if (!sourceId || sourceId === item.id) return;

                    var srcIdx = -1, targetIdx = -1;
                    for (var sI = 0; sI < shelves.length; sI++) {
                        if (shelves[sI].id === sourceId) srcIdx = sI;
                        if (shelves[sI].id === item.id) targetIdx = sI;
                    }

                    if (srcIdx >= 0 && targetIdx >= 0) {
                        var moved = shelves.splice(srcIdx, 1)[0];
                        shelves.splice(targetIdx, 0, moved);
                        refreshListFocus(moved.id, 'toggle');
                        if (targetIdx === 0) {
                            Lampa.Noty.show('Полка «' + moved.title + '» перемещена в самый верх!');
                        } else {
                            Lampa.Noty.show('Полка «' + moved.title + '» перемещена на позицию ' + (targetIdx + 1));
                        }
                    }
                });

                row.on('dragend', function(e) {
                    $('.surs-sm-item--dragging').removeClass('surs-sm-item--dragging');
                    $('.surs-sm-item--drag-over').removeClass('surs-sm-item--drag-over');
                });

                // Перетаскивание только после короткого удержания рукоятки.
                // Случайное касание не должно немедленно превращаться в сортировку.
                var handle = row.find('.surs-sm-drag-handle');
                var touchSourceId = null;
                var touchTargetId = null;
                var touchArmed = false;
                var touchTimer = null;
                var touchStartY = 0;

                function clearTouchReorder() {
                    if (touchTimer) clearTimeout(touchTimer);
                    touchTimer = null;
                    touchSourceId = null;
                    touchTargetId = null;
                    touchArmed = false;
                    $('.surs-sm-item--dragging').removeClass('surs-sm-item--dragging');
                    $('.surs-sm-item--drag-over').removeClass('surs-sm-item--drag-over');
                }

                handle.on('touchstart', function(e) {
                    var touch = e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0];
                    if (!touch) return;
                    touchSourceId = item.id;
                    touchTargetId = null;
                    touchStartY = touch.clientY;
                    touchArmed = false;
                    if (touchTimer) clearTimeout(touchTimer);
                    touchTimer = setTimeout(function() {
                        touchArmed = true;
                        row.addClass('surs-sm-item--dragging');
                    }, 220);
                });

                handle.on('touchmove', function(e) {
                    var touch = e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0];
                    if (!touch || !touchSourceId) return;
                    if (!touchArmed) {
                        if (Math.abs(touch.clientY - touchStartY) > 8) clearTouchReorder();
                        return;
                    }
                    if (e.cancelable !== false) e.preventDefault();

                    var listElem = modalHtml && modalHtml.find('.surs-sm-list')[0];
                    if (listElem) {
                        var listRect = listElem.getBoundingClientRect();
                        if (touch.clientY < listRect.top + 60) listElem.scrollTop -= 14;
                        else if (touch.clientY > listRect.bottom - 60) listElem.scrollTop += 14;
                    }

                    var elem = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (!elem) return;
                    var trg = $(elem).closest('.surs-sm-item:visible');
                    if (trg.length && trg.attr('data-id') !== touchSourceId) {
                        $('.surs-sm-item--drag-over').removeClass('surs-sm-item--drag-over');
                        trg.addClass('surs-sm-item--drag-over');
                        touchTargetId = trg.attr('data-id');
                    } else {
                        $('.surs-sm-item--drag-over').removeClass('surs-sm-item--drag-over');
                        touchTargetId = null;
                    }
                });

                handle.on('touchend touchcancel', function(e) {
                    var fromId = touchSourceId, toId = touchTargetId;
                    var shouldMove = e.type === 'touchend' && touchArmed &&
                        fromId && toId && fromId !== toId;
                    clearTouchReorder();
                    if (!shouldMove) return;
                    var from = -1, to = -1;
                    for (var index = 0; index < shelves.length; index++) {
                        if (shelves[index].id === fromId) from = index;
                        if (shelves[index].id === toId) to = index;
                    }
                    if (from < 0 || to < 0) return;
                    var moved = shelves.splice(from, 1)[0];
                    shelves.splice(to, 0, moved);
                    refreshListFocus(moved.id, 'handle');
                    Lampa.Noty.show('Полка перемещена на позицию ' + (to + 1));
                });

                list.append(row);
            });

            list.append('<div class="surs-sm-empty-search">По вашему запросу полки не найдены</div>');
            modalHtml.append(list);

            function filterVisibleRows() {
                var needle = searchQuery.trim().toLowerCase();
                var matched = 0;
                list.children('.surs-sm-item').each(function() {
                    var el = $(this);
                    var hit = !needle || String(el.data('surs-search') || '').indexOf(needle) !== -1;
                    el.toggleClass('surs-sm-row-filtered', !hit);
                    if (hit) matched++;
                });
                list.find('.surs-sm-empty-search').toggle(!!needle && matched === 0);
            }
            filterVisibleRows();

            function openSearchKeyboard() {
                if (!Lampa.Input || typeof Lampa.Input.edit !== 'function') {
                    Lampa.Noty.show('Поиск недоступен в этой сборке Lampa');
                    return;
                }
                Lampa.Input.edit({
                    title: 'Поиск полок',
                    value: searchQuery, free: true, nosave: true
                }, function(value) {
                    searchQuery = String(value || '').trim();
                    Lampa.Controller.toggle('surs_shelf_manager');
                    refreshListFocus(null, 'tab');
                });
            }

            var pluginActionBtn = '';
            if (activeCategory === 'plugin') {
                pluginActionBtn = '<div class="surs-sm-btn surs-sm-btn--ghost selector" data-action="hide-all-plugins" style="color:#ff6b6b;border-color:rgba(231,76,60,0.3);">✕ Выключить все плагины</div>';
            }

            var footer = $(`
                <div class="surs-sm-footer">
                    <div class="surs-sm-footer-left">
                        <div class="surs-sm-btn surs-sm-btn--ghost selector" data-action="add">+ Добавить полку</div>
                        <div class="surs-sm-btn surs-sm-btn--rescan selector" data-action="rescan">🔄 Обновить</div>
                        <div class="surs-sm-btn surs-sm-btn--ghost selector" data-action="search">⌕ Поиск</div>
                        ${pluginActionBtn}
                    </div>
                    <div class="surs-sm-footer-right">
                        <div class="surs-sm-btn surs-sm-btn--reset selector" data-action="reset">Сброс</div>
                        <div class="surs-sm-btn surs-sm-btn--ghost selector" data-action="cancel">Отмена</div>
                        <div class="surs-sm-btn surs-sm-btn--primary selector ${hasUnsavedChanges() ? '' : 'surs-sm-btn--inactive'}" data-action="apply" aria-disabled="${hasUnsavedChanges() ? 'false' : 'true'}">✓ Применить</div>
                    </div>
                </div>
            `);

            footer.find('[data-action="search"]').on('hover:enter click', function(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                openSearchKeyboard();
            });

            // Повторное обнаружение зарегистрированных источников.
            footer.find('[data-action="rescan"]').on('hover:enter click', function(e) {
                e.stopPropagation();
                runAutoDiscovery(true);
                // Автоматически добавляем вновь обнаруженные плагины, если их еще нет в списке - выключенными по умолчанию (enabled: false)
                var all = getAllAvailableShelves();
                var newAdded = 0;
                all.forEach(function(s) {
                    var isPluginShelf = s.cat === 'plugin' || s.cat === 'trakt' || (s.id && (s.id.indexOf('ext_') === 0 || s.id.indexOf('cr_') === 0));
                    if (isPluginShelf && !shelves.some(function(sh) { return sh.id === s.id; })) {
                        shelves.push({ id: s.id, title: s.title, enabled: false, cat: s.cat || 'plugin', desc: s.desc });
                        newAdded++;
                    }
                });
                if (newAdded > 0) {
                    Lampa.Noty.show('Найдено новых полок: ' + newAdded + ' (выключены по умолчанию)');
                }
                refreshListFocus('rescan_btn', 'rescan');
            });

            // Выключить все плагины
            footer.find('[data-action="hide-all-plugins"]').on('hover:enter click', function(e) {
                e.stopPropagation();
                var count = 0;
                shelves.forEach(function(s) {
                    var cat = getShelfCategory(s.id);
                    var isPluginShelf = cat === 'plugin' || cat === 'trakt' || s.cat === 'plugin' || s.cat === 'trakt' || (s.id && (s.id.indexOf('ext_') === 0 || s.id.indexOf('cr_') === 0));
                    if (isPluginShelf && s.enabled) {
                        s.enabled = false;
                        count++;
                    }
                });
                refreshListFocus(null, 'tab');
                Lampa.Noty.show('Все сторонние плагины выключены (' + count + ')');
            });

            // Добавить полку
            footer.find('[data-action="add"]').on('hover:enter click', function(e) {
                e.stopPropagation();
                openAddShelfDialog();
            });

            // Сброс по умолчанию с защитным подтверждением
            footer.find('[data-action="reset"]').on('hover:enter click', function(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                Lampa.Select.show({
                    title: 'Сбросить полки раздела «' + shelfScopeTitle(editorScope) + '»?',
                    items: [
                        { title: 'Да, сбросить порядок и отключить плагины', action: 'confirm' },
                        { title: 'Отмена', action: 'cancel' }
                    ],
                    onSelect: function(a) {
                        if (a.action === 'confirm') {
                            // Сброс выполняется сразу после подтверждения, без второго «Применить».
                            var resetResult = executeBulletproofReset(editorScope);
                            if (!resetResult) {
                                Lampa.Controller.toggle('surs_shelf_manager');
                                return;
                            }
                            shelves = resetResult;
                            activeCategory = 'all';
                            searchQuery = '';
                            closeModalSafely(true);
                            Lampa.Noty.show('Сброшен раздел «' + shelfScopeTitle(editorScope) + '»');
                        }
                    },
                    onBack: function() {
                        Lampa.Controller.toggle('surs_shelf_manager');
                    }
                });
            });

            // Выход без сохранения, в том числе на смартфоне.
            footer.find('[data-action="cancel"]').on('hover:enter click', function(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                requestCloseEditor();
            });

            // Применить
            footer.find('[data-action="apply"]').on('hover:enter click', function(e) {
                if (e && e.stopPropagation) e.stopPropagation();
                if (!hasUnsavedChanges()) {
                    Lampa.Noty.show('Изменений нет');
                    return;
                }
                applyAndClose();
            });

            modalHtml.append(footer);

            return modalHtml;
        }

        function scrollItemIntoView(elem) {
            if (!elem) return;
            var root = modalHtml || $('.surs-sm-wrap');
            var list = root.find('.surs-sm-list')[0];
            if (!list) return;

            var row = $(elem).closest('.surs-sm-item:visible')[0];
            if (!row) {
                if ($(elem).hasClass('surs-sm-tab')) {
                    list.scrollTop = 0;
                }
                return;
            }

            var listRect = list.getBoundingClientRect();
            var rowRect = row.getBoundingClientRect();
            var padding = 20;

            if (rowRect.top < listRect.top + padding) {
                list.scrollTop += (rowRect.top - listRect.top - padding);
            } else if (rowRect.bottom > listRect.bottom - padding) {
                list.scrollTop += (rowRect.bottom - listRect.bottom + padding);
            }
        }

        function setModalFocus(elem, needScroll) {
            if (!elem) return;
            if (elem instanceof $) elem = elem[0];
            if (!elem) return;

            var root = modalHtml || $('.surs-sm-wrap');
            Lampa.Controller.collectionFocus(elem, root);

            if (needScroll !== false) {
                scrollItemIntoView(elem);
            }
        }

        function getCurrentFocus() {
            var root = modalHtml || $('.surs-sm-wrap');
            var cur = root.find('.selector.focus:visible');
            if (!cur.length && window.Navigator && window.Navigator._focus) {
                cur = $(window.Navigator._focus);
            }
            if (!cur.length) {
                cur = root.find('.surs-sm-tab.active');
            }
            if (!cur.length) {
                cur = root.find('.selector:visible').eq(0);
            }
            return cur;
        }

        function refreshListFocus(targetId, buttonType) {
            var oldRoot = modalHtml || $('.surs-sm-wrap');
            var oldList = oldRoot.find('.surs-sm-list');
            var previousScroll = oldList.length ? oldList.scrollTop() : 0;
            // Persist horizontal rail position across category changes and list reorders.
            var oldTabs = oldRoot.find('.surs-sm-tabs');
            var previousTabScroll = oldTabs.length ? oldTabs.scrollLeft() : 0;
            var newContent = renderModalContent();
            if (modalHtml) modalHtml.replaceWith(newContent);
            else $('.surs-sm-wrap').replaceWith(newContent);
            newContent.find('.surs-sm-list').scrollTop(previousScroll);
            newContent.find('.surs-sm-tabs').scrollLeft(previousTabScroll);
            modalHtml = newContent;

            Lampa.Controller.collectionSet(newContent);

            // Keep the selected tab visible on small screens and for D-pad navigation.
            var tabViewport = newContent.find('.surs-sm-tabs')[0];
            var selectedTab = newContent.find('.surs-sm-tab.active')[0];
            if (tabViewport && selectedTab && tabViewport.getBoundingClientRect &&
                selectedTab.getBoundingClientRect) {
                var viewportRect = tabViewport.getBoundingClientRect();
                var selectedRect = selectedTab.getBoundingClientRect();
                if (selectedRect.left < viewportRect.left + 4) {
                    tabViewport.scrollLeft -= (viewportRect.left + 4 - selectedRect.left);
                } else if (selectedRect.right > viewportRect.right - 4) {
                    tabViewport.scrollLeft += (selectedRect.right - viewportRect.right + 4);
                }
            }

            var focusTarget = null;
            if (targetId === 'rescan_btn') {
                focusTarget = newContent.find('[data-action="rescan"]')[0];
            } else if (buttonType === 'reset') {
                focusTarget = newContent.find('[data-action="reset"]')[0] || newContent.find('[data-action="apply"]')[0];
            } else if (targetId) {
                var row = newContent.find('[data-id="' + targetId + '"]');
                if (row.length && !row.hasClass('surs-sm-row-filtered')) {
                    if (buttonType === 'top') focusTarget = row.find('.surs-sm-navbtn--top')[0];
                    else if (buttonType === 'up') focusTarget = row.find('.surs-sm-navbtn--up')[0];
                    else if (buttonType === 'down') focusTarget = row.find('.surs-sm-navbtn--down')[0];
                    else if (buttonType === 'handle') focusTarget = row.find('.surs-sm-drag-handle')[0];
                    else if (buttonType === 'more') focusTarget = row.find('.surs-sm-navbtn--more')[0];
                    else if (buttonType === 'toggle') focusTarget = row.find('.surs-sm-toggle')[0];
                    else focusTarget = row.find('.selector')[0];
                }
            } else if (buttonType === 'tab') {
                focusTarget = newContent.find('.surs-sm-tab.active')[0];
            }

            if (!focusTarget) {
                focusTarget = newContent.find('.selector.focus:visible')[0] ||
                              newContent.find('.surs-sm-item:visible .surs-sm-toggle').first()[0] ||
                              newContent.find('.surs-sm-tab.active:visible')[0] ||
                              newContent.find('.selector:visible')[0];
            }

            if (focusTarget) {
                setModalFocus(focusTarget, buttonType === 'reset' ? false : true);
            }
        }

        function openAddShelfDialog() {
            var allAvailable = getAllAvailableShelves();
            var unadded = allAvailable.filter(function(b) {
                return !shelves.some(function(s){ return s.id === b.id; });
            });

            if (!unadded.length) {
                Lampa.Noty.show('Все доступные полки уже в списке!');
                return;
            }

            var items = unadded.map(function(u) {
                var prefix = getBadgePrefix(u.cat);
                return {
                    title: prefix + ' ' + u.title + (u.desc ? ' · ' + u.desc : ''),
                    action: function() {
                        shelves.push({ id: u.id, title: u.title, enabled: true, cat: u.cat, desc: u.desc });
                        refreshListFocus(u.id, 'toggle');
                        Lampa.Noty.show('Полка «' + u.title + '» добавлена!');
                    }
                };
            });

            Lampa.Select.show({
                title: 'Выберите полку для добавления (' + unadded.length + ' доступно)',
                items: items,
                onSelect: function(item) { item.action(); },
                onBack: function() {
                    Lampa.Controller.toggle('surs_shelf_manager');
                }
            });
        }

        modalHtml = renderModalContent();

        Lampa.Modal.open({
            title: '',
            html: modalHtml,
            size: 'large',
            onBack: function() {
                requestCloseEditor();
            }
        });
        try {
            var shell = Lampa.Modal.render && Lampa.Modal.render();
            if (shell && shell.addClass) {
                shell.addClass('surs-sm-modal');
                if (editorPlatform.touch) shell.addClass('surs-sm--touch');
                if (editorPlatform.tv) shell.addClass('surs-sm--tv');
            }
        } catch(e) {
            console.warn('[SURS] Не удалось пометить окно редактора:', e);
        }

        Lampa.Controller.add('surs_shelf_manager', {
            toggle: function () {
                var root = modalHtml || $('.surs-sm-wrap');
                Lampa.Controller.collectionSet(root);
                var f = root.find('.selector.focus')[0] || root.find('.surs-sm-tab.active')[0] || root.find('.selector')[0];
                setModalFocus(f, true);
            },
            up: function () {
                var root = modalHtml || $('.surs-sm-wrap');
                var cur = getCurrentFocus();

                // 1. Из футера -> переход к последней строке списка
                if (cur.closest('.surs-sm-footer').length) {
                    var allRows = root.find('.surs-sm-item:visible');
                    if (allRows.length) {
                        var lastRow = allRows.last();
                        var target = lastRow.find('.surs-sm-toggle')[0] || lastRow.find('.selector')[0];
                        setModalFocus(target, true);
                    } else {
                        var tab = root.find('.surs-sm-tab.active')[0] || root.find('.surs-sm-tab')[0];
                        setModalFocus(tab, false);
                    }
                    return;
                }

                // 2. В строке списка -> переход к предыдущей строке или к вкладкам
                var row = cur.closest('.surs-sm-item');
                if (row.length) {
                    var allRows = root.find('.surs-sm-item:visible');
                    var rowIndex = allRows.index(row);
                    var currentAction = cur.data('action');
                    var rowSelectors = row.find('.selector');
                    var btnIndex = rowSelectors.index(cur);

                    if (rowIndex > 0) {
                        var prevRow = allRows.eq(rowIndex - 1);
                        var prevTarget = null;
                        if (currentAction) {
                            prevTarget = prevRow.find('[data-action="' + currentAction + '"]')[0];
                        }
                        if (!prevTarget) {
                            var prevSelectors = prevRow.find('.selector');
                            prevTarget = prevSelectors.eq(btnIndex >= 0 ? btnIndex : 0)[0] || prevSelectors[0];
                        }
                        setModalFocus(prevTarget, true);
                    } else {
                        // Первая строка -> переходим к активной вкладке
                        var activeTab = root.find('.surs-sm-tab.active')[0] || root.find('.surs-sm-tab')[0];
                        setModalFocus(activeTab, true);
                    }
                    return;
                }

                // From category tabs, Up selects the screen profile selector.
                if (cur.hasClass('surs-sm-tab')) {
                    var currentProfile = root.find('.surs-sm-screen-tab.active')[0];
                    if (currentProfile) setModalFocus(currentProfile, false);
                    return;
                }
                if (cur.hasClass('surs-sm-screen-tab')) return;

                try { Navigator.move('up'); } catch(e){}
            },
            down: function () {
                var root = modalHtml || $('.surs-sm-wrap');
                var cur = getCurrentFocus();

                // From the screen selector, Down opens category filters.
                if (cur.hasClass('surs-sm-screen-tab')) {
                    var categoryTab = root.find('.surs-sm-tab.active')[0];
                    if (categoryTab) setModalFocus(categoryTab, false);
                    return;
                }

                // 1. Из вкладок -> переход к первой строке списка
                if (cur.hasClass('surs-sm-tab')) {
                    var firstRow = root.find('.surs-sm-item:visible').first();
                    if (firstRow.length) {
                        var target = firstRow.find('.surs-sm-toggle')[0] || firstRow.find('.selector')[0];
                        setModalFocus(target, true);
                    } else {
                        var footerBtn = root.find('.surs-sm-footer [data-action="add"]')[0] || root.find('.surs-sm-footer .selector')[0];
                        setModalFocus(footerBtn, false);
                    }
                    return;
                }

                // 2. В строке списка -> переход к следующей строке или в футер (только с последней строки!)
                var row = cur.closest('.surs-sm-item');
                if (row.length) {
                    var allRows = root.find('.surs-sm-item:visible');
                    var rowIndex = allRows.index(row);
                    var currentAction = cur.data('action');
                    var rowSelectors = row.find('.selector');
                    var btnIndex = rowSelectors.index(cur);

                    if (rowIndex < allRows.length - 1) {
                        var nextRow = allRows.eq(rowIndex + 1);
                        var nextTarget = null;
                        if (currentAction) {
                            nextTarget = nextRow.find('[data-action="' + currentAction + '"]')[0];
                        }
                        if (!nextTarget) {
                            var nextSelectors = nextRow.find('.selector');
                            nextTarget = nextSelectors.eq(btnIndex >= 0 ? btnIndex : 0)[0] || nextSelectors[0];
                        }
                        setModalFocus(nextTarget, true);
                    } else {
                        // Достигли последней строки! Переходим в футер на кнопку "Применить"
                        var applyBtn = root.find('.surs-sm-footer [data-action="apply"]')[0] || root.find('.surs-sm-footer .selector')[0];
                        setModalFocus(applyBtn, false);
                    }
                    return;
                }

                // 3. В футере -> уже внизу
                if (cur.closest('.surs-sm-footer').length) {
                    return;
                }

                try { Navigator.move('down'); } catch(e){}
            },
            left: function () {
                var root = modalHtml || $('.surs-sm-wrap');
                var cur = getCurrentFocus();

                if (cur.hasClass('surs-sm-screen-tab')) {
                    var screens = root.find('.surs-sm-screen-tab');
                    var screenIndex = screens.index(cur);
                    if (screenIndex > 0) setModalFocus(screens.eq(screenIndex - 1)[0], false);
                    return;
                }

                // Во вкладках
                if (cur.hasClass('surs-sm-tab')) {
                    var tabs = root.find('.surs-sm-tab');
                    var tabIndex = tabs.index(cur);
                    if (tabIndex > 0) {
                        setModalFocus(tabs.eq(tabIndex - 1)[0], false);
                    }
                    return;
                }

                // Внутри строки (между кнопками строки: Toggle <-> Up <-> Down <-> Remove)
                var row = cur.closest('.surs-sm-item');
                if (row.length) {
                    var selectors = row.find('.selector');
                    var idx = selectors.index(cur);
                    if (idx > 0) {
                        setModalFocus(selectors.eq(idx - 1)[0], false);
                    }
                    return;
                }

                // В футере
                var footer = cur.closest('.surs-sm-footer');
                if (footer.length) {
                    var fBtns = footer.find('.selector');
                    var fIdx = fBtns.index(cur);
                    if (fIdx > 0) {
                        setModalFocus(fBtns.eq(fIdx - 1)[0], false);
                    }
                    return;
                }

                try { Navigator.move('left'); } catch(e){}
            },
            right: function () {
                var root = modalHtml || $('.surs-sm-wrap');
                var cur = getCurrentFocus();

                // Во вкладках
                if (cur.hasClass('surs-sm-tab')) {
                    var tabs = root.find('.surs-sm-tab');
                    var tabIndex = tabs.index(cur);
                    if (tabIndex < tabs.length - 1) {
                        setModalFocus(tabs.eq(tabIndex + 1)[0], false);
                    }
                    return;
                }

                // Внутри строки
                var row = cur.closest('.surs-sm-item');
                if (row.length) {
                    var selectors = row.find('.selector');
                    var idx = selectors.index(cur);
                    if (idx < selectors.length - 1) {
                        setModalFocus(selectors.eq(idx + 1)[0], false);
                    }
                    return;
                }

                // В футере
                var footer = cur.closest('.surs-sm-footer');
                if (footer.length) {
                    var fBtns = footer.find('.selector');
                    var fIdx = fBtns.index(cur);
                    if (fIdx < fBtns.length - 1) {
                        setModalFocus(fBtns.eq(fIdx + 1)[0], false);
                    }
                    return;
                }

                try { Navigator.move('right'); } catch(e){}
            },
            enter: function () {
                var cur = getCurrentFocus();
                if (cur && cur.length) {
                    // Кнопки слушают оба события; одного достаточно, иначе действие дублируется.
                    cur.trigger('hover:enter');
                }
            },
            back: function () {
                requestCloseEditor();
            }
        });

        Lampa.Controller.toggle('surs_shelf_manager');
    }


        return openShelfManagerModal;
    };
})(window);
