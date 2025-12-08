/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState, onMounted, onWillStart, onWillUnmount, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { loadJS } from "@web/core/assets";
import { View } from "@web/views/view";

export class ZohoDashboard extends Component {
    static template = "hrms_dashboard.ZohoDashboard";
    static props = ["*"];
    static components = { View };

    setup() {
        // Core Services - Only use services that are available
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");
        
        // Note: "user" service is NOT available in client actions
        // We'll get user info from the session or ORM calls instead
        this.userId = null;
        this.userContext = {};

        // Refs
        this.dashboardWrapperRef = useRef("dashboardWrapper");

        // Embedded State
        this.embeddedState = useState({
            isEmbeddedMode: false,
            currentApp: null,
            currentMenus: [],
            breadcrumbs: [],
            loading: false,
            viewTitle: "",
            currentViewType: "list",
            currentResModel: null,
            currentResId: false,
            currentDomain: [],
            currentContext: {},
            availableViewTypes: [],
            viewProps: null,
            viewKey: 0,
            errorMessage: null,
        });

        // Local State
        this.state = useState({
            loading: true,
            isManager: false,
            currentView: "home",
            activeTab: "activities",
            activeMainTab: "myspace",
            employee: null,
            attendance: [],
            leaves: [],
            expenses: [],
            projects: [],
            birthdays: [],
            events: [],
            announcements: [],
            apps: [],
            searchQuery: "",
            timerSeconds: 0,
            timerRunning: false,
            leaveChartData: [],
            deptChartData: [],
            chartLoaded: false,
            leaveBalances: [],
            teamMembers: [],
            skills: [],
            currentAnnouncementIndex: 0,
            currentTime: new Date(),
        });

        // Navigation items
        this.sidebarItems = [
            { id: "home", icon: "🏠", label: "Home", action: "home" },
            { id: "profile", icon: "👤", label: "Profile", action: "profile" },
            { id: "leave", icon: "📅", label: "Leave", model: "hr.leave", title: "My Leaves" },
            { id: "attendance", icon: "⏰", label: "Attendance", model: "hr.attendance", title: "My Attendance" },
            { id: "timesheet", icon: "⏱️", label: "Timesheets", model: "account.analytic.line", title: "My Timesheets" },
            { id: "payroll", icon: "💰", label: "Payroll", model: "hr.payslip", title: "My Payslips" },
            { id: "expense", icon: "💳", label: "Expenses", model: "hr.expense", title: "My Expenses" },
            { id: "operations", icon: "⚙️", label: "Operations", action: "operations" },
        ];

        this.contentTabs = [
            { id: "activities", label: "Activities" },
            { id: "attendance", label: "Attendance" },
            { id: "leaves", label: "Leaves" },
            { id: "expenses", label: "Expenses" },
            { id: "projects", label: "Projects" },
            { id: "notifications", label: "Notifications" },
        ];

        this.mainTabs = [
            { id: "myspace", label: "My Space" },
            { id: "team", label: "Team" },
            { id: "organization", label: "Organization" },
        ];

        // Lifecycle
        onWillStart(async () => {
            await this.loadUserInfo();
            await this.loadChartLibrary();
            await this.loadInitialData();
            await this.loadPhase4Data();
        });

        onMounted(() => {
            this.initializeTimer();
            this.startClockTimer();
            this.startAnnouncementSlider();
            this.setupPersistentFrame();
            if (this.state.chartLoaded) {
                this.renderCharts();
            }
        });

        onWillUnmount(() => {
            this.cleanup();
        });
    }

    // ==================== USER INFO ====================
    
    /**
     * Load user information from ORM since user service is not available
     */
    async loadUserInfo() {
        try {
            // Get current user ID from session
            const result = await this.orm.call("res.users", "search_read", [
                [["id", "=", (await this.orm.call("res.users", "search", [[]], { limit: 1 }))[0] || 1]],
                ["id", "name", "login"]
            ], { limit: 1 });
            
            if (result && result.length > 0) {
                this.userId = result[0].id;
            }
        } catch (e) {
            // Fallback - try to get from session info
            try {
                const sessionInfo = await this.orm.call("ir.http", "session_info", []);
                this.userId = sessionInfo?.uid || 1;
            } catch (e2) {
                this.userId = 1;
            }
        }
    }

    // ==================== PERSISTENT FRAME SETUP ====================

    setupPersistentFrame() {
        document.body.classList.add('zoho-dashboard-active');
        this.hideOdooNavbar();
    }

    cleanup() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.clockInterval) clearInterval(this.clockInterval);
        if (this.announcementInterval) clearInterval(this.announcementInterval);
        document.body.classList.remove('zoho-dashboard-active');
        this.showOdooNavbar();
    }

    hideOdooNavbar() {
        const navbar = document.querySelector('.o_main_navbar');
        if (navbar) navbar.style.display = 'none';
    }

    showOdooNavbar() {
        const navbar = document.querySelector('.o_main_navbar');
        if (navbar) navbar.style.display = '';
    }

    // ==================== DYNAMIC EMBEDDED VIEW SYSTEM ====================

    /**
     * Main entry point for loading any embedded view dynamically
     */
    async loadEmbeddedView(resModel, title, domain = [], viewType = "list", context = {}) {
        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;
        this.embeddedState.isEmbeddedMode = true;
        this.embeddedState.viewTitle = title;
        this.embeddedState.breadcrumbs = [{ name: title, type: 'model' }];
        this.embeddedState.currentResModel = resModel;
        this.embeddedState.currentResId = false;
        this.embeddedState.currentDomain = domain;
        this.embeddedState.currentViewType = viewType;
        this.embeddedState.currentContext = context;
        this.state.currentView = "embedded";

        try {
            // Load menus for this model dynamically
            const menuInfo = await this.loadMenusForModel(resModel);
            if (menuInfo.rootMenu) {
                this.embeddedState.currentApp = {
                    id: menuInfo.rootMenu.id,
                    name: menuInfo.rootMenu.name
                };
                this.embeddedState.currentMenus = menuInfo.children;
                this.embeddedState.breadcrumbs = [
                    { id: menuInfo.rootMenu.id, name: menuInfo.rootMenu.name, type: 'app' },
                    { name: title, type: 'view' }
                ];
            } else {
                this.embeddedState.currentApp = { name: title };
                this.embeddedState.currentMenus = [];
            }

            // Load available view types dynamically
            await this.loadAvailableViewTypes(resModel);

            // Ensure we use an available view type
            if (!this.embeddedState.availableViewTypes.includes(viewType)) {
                viewType = this.embeddedState.availableViewTypes[0] || "list";
                this.embeddedState.currentViewType = viewType;
            }

            // Build view props dynamically
            this.buildDynamicViewProps(resModel, viewType, domain, context);

        } catch (error) {
            console.error("Failed to load embedded view:", error);
            this.embeddedState.errorMessage = error.message || "Failed to load view";
            this.embeddedState.viewProps = null;
        } finally {
            this.embeddedState.loading = false;
        }
    }

    /**
     * Build view props dynamically - handles all models and view types
     */
    buildDynamicViewProps(resModel, viewType, domain = [], context = {}, resId = false) {
        // Clean and prepare context
        const fullContext = this.prepareContext(resModel, context);
        
        // Clean domain - remove any problematic entries
        const cleanDomain = this.cleanDomain(domain);

        // Build base props
        const props = {
            resModel: resModel,
            type: viewType,
            domain: cleanDomain,
            context: fullContext,
            // Control panel configuration
            display: {
                controlPanel: {
                    "top-left": true,
                    "top-right": true,
                    "bottom-left": true,
                    "bottom-right": true,
                },
            },
            // Callbacks for navigation
            selectRecord: (resId, options) => this.handleSelectRecord(resModel, resId, options),
            createRecord: () => this.handleCreateRecord(resModel),
        };

        // For form views, add resId
        if (viewType === "form" && resId) {
            props.resId = resId;
        }

        // Increment key to force re-render
        this.embeddedState.viewKey++;
        this.embeddedState.viewProps = props;
        this.embeddedState.errorMessage = null;
    }

    /**
     * Prepare context with appropriate defaults based on model
     */
    prepareContext(resModel, baseContext = {}) {
        const context = { ...baseContext };

        // Add employee defaults for HR models
        if (this.state.employee?.id) {
            const hrModels = [
                "hr.leave", "hr.leave.allocation", "hr.attendance", 
                "hr.payslip", "hr.expense", "hr.expense.sheet",
                "hr.contract", "hr.appraisal"
            ];
            if (hrModels.includes(resModel)) {
                context.default_employee_id = this.state.employee.id;
            }
        }

        // Add common context flags
        context.dashboard_embedded = true;

        return context;
    }

    /**
     * Clean domain - handle various domain formats safely
     */
    cleanDomain(domain) {
        if (!domain) return [];
        if (! Array.isArray(domain)) return [];
        
        try {
            // Filter out any invalid domain entries
            return domain.filter(item => {
                if (Array.isArray(item)) {
                    // Valid domain tuple should have 3 elements
                    return item.length === 3;
                }
                // Allow operators like '&', '|', '!'
                if (typeof item === 'string' && ['&', '|', '!'].includes(item)) {
                    return true;
                }
                return false;
            });
        } catch (e) {
            console.warn("Error cleaning domain:", e);
            return [];
        }
    }

    /**
     * Handle record selection - navigate to form view
     */
    async handleSelectRecord(resModel, resId, options = {}) {
        // Get record name for breadcrumb
        let recordName = `#${resId}`;
        try {
            const records = await this.orm.read(resModel, [resId], ["display_name"]);
            if (records.length > 0 && records[0].display_name) {
                recordName = records[0].display_name;
            }
        } catch (e) {
            // Use default name
        }

        // Update breadcrumbs
        const currentBreadcrumbs = [...this.embeddedState.breadcrumbs];
        currentBreadcrumbs.push({
            name: recordName,
            type: 'record',
            resId: resId,
            previousViewType: this.embeddedState.currentViewType
        });

        this.embeddedState.breadcrumbs = currentBreadcrumbs;
        this.embeddedState.viewTitle = recordName;
        this.embeddedState.currentResId = resId;
        this.embeddedState.currentViewType = "form";

        // Build form view props
        this.buildDynamicViewProps(
            resModel,
            "form",
            [],
            this.embeddedState.currentContext,
            resId
        );
    }

    /**
     * Handle create record - open empty form
     */
    handleCreateRecord(resModel) {
        // Update breadcrumbs
        const currentBreadcrumbs = [...this.embeddedState.breadcrumbs];
        currentBreadcrumbs.push({
            name: _t("New"),
            type: 'new',
            previousViewType: this.embeddedState.currentViewType
        });

        this.embeddedState.breadcrumbs = currentBreadcrumbs;
        this.embeddedState.viewTitle = _t("New");
        this.embeddedState.currentResId = false;
        this.embeddedState.currentViewType = "form";

        // Build form view props for new record
        this.buildDynamicViewProps(
            resModel,
            "form",
            [],
            this.embeddedState.currentContext,
            false
        );
    }

    /**
     * Dynamically find menus for any model
     */
    async loadMenusForModel(resModel) {
        try {
            // First, try to find an action for this model
            const actions = await this.orm.searchRead(
                "ir.actions.act_window",
                [["res_model", "=", resModel]],
                ["id", "name"],
                { limit: 1 }
            );

            if (actions.length > 0) {
                // Find menu that links to this action
                const actionId = actions[0].id;
                const menus = await this.orm.searchRead(
                    "ir.ui.menu",
                    [["action", "=", `ir.actions.act_window,${actionId}`]],
                    ["id", "name", "parent_id"],
                    { limit: 1 }
                );

                if (menus.length > 0) {
                    // Find root menu
                    let currentMenu = menus[0];
                    while (currentMenu.parent_id) {
                        const parentMenus = await this.orm.searchRead(
                            "ir.ui.menu",
                            [["id", "=", currentMenu.parent_id[0]]],
                            ["id", "name", "parent_id"],
                            { limit: 1 }
                        );
                        if (parentMenus.length > 0) {
                            currentMenu = parentMenus[0];
                        } else {
                            break;
                        }
                    }

                    // Load children of root menu
                    const menuData = await this.orm.call(
                        "ir.ui.menu",
                        "get_menu_with_all_children",
                        [currentMenu.id]
                    );

                    return {
                        rootMenu: currentMenu,
                        children: menuData?.children || []
                    };
                }
            }

            return { rootMenu: null, children: [] };
        } catch (error) {
            console.error("Failed to load menus for model:", error);
            return { rootMenu: null, children: [] };
        }
    }

    /**
     * Load available view types for any model
     */
    async loadAvailableViewTypes(resModel) {
        try {
            // Get views from ir.ui.view
            const views = await this.orm.searchRead(
                "ir.ui.view",
                [
                    ["model", "=", resModel],
                    ["type", "in", ["list", "tree", "kanban", "form", "calendar", "pivot", "graph", "activity"]]
                ],
                ["type"],
                { limit: 50 }
            );

            // Normalize types (tree -> list)
            const typeSet = new Set();
            for (const view of views) {
                const type = view.type === "tree" ? "list" : view.type;
                typeSet.add(type);
            }

            // Convert to array
            let availableTypes = Array.from(typeSet);

            // Ensure at least list and form are available
            if (!availableTypes.includes("list")) {
                availableTypes.unshift("list");
            }
            if (!availableTypes.includes("form")) {
                availableTypes.push("form");
            }

            this.embeddedState.availableViewTypes = availableTypes;
        } catch (error) {
            console.error("Failed to load view types:", error);
            this.embeddedState.availableViewTypes = ["list", "form"];
        }
    }

    /**
     * Switch view type
     */
    switchEmbeddedViewType(newType) {
        if (! this.embeddedState.currentResModel) return;
        if (this.embeddedState.currentViewType === newType) return;

        // If in form view, go back to list first
        if (this.embeddedState.currentViewType === "form") {
            this.goBackFromForm();
            if (newType === "list" || newType === "kanban") {
                this.embeddedState.currentViewType = newType;
                this.buildDynamicViewProps(
                    this.embeddedState.currentResModel,
                    newType,
                    this.embeddedState.currentDomain,
                    this.embeddedState.currentContext
                );
            }
            return;
        }

        this.embeddedState.currentViewType = newType;
        this.buildDynamicViewProps(
            this.embeddedState.currentResModel,
            newType,
            this.embeddedState.currentDomain,
            this.embeddedState.currentContext
        );
    }

    /**
     * Go back from form view to list/kanban
     */
    goBackFromForm() {
        if (this.embeddedState.breadcrumbs.length > 1) {
            const lastCrumb = this.embeddedState.breadcrumbs[this.embeddedState.breadcrumbs.length - 1];
            this.embeddedState.breadcrumbs = this.embeddedState.breadcrumbs.slice(0, -1);
            
            const previousType = lastCrumb.previousViewType || "list";
            this.embeddedState.currentViewType = previousType;
            this.embeddedState.currentResId = false;
            
            if (this.embeddedState.breadcrumbs.length > 0) {
                this.embeddedState.viewTitle = this.embeddedState.breadcrumbs[this.embeddedState.breadcrumbs.length - 1].name;
            }
        }
    }

    /**
     * Check if view type is available
     */
    isViewTypeAvailable(viewType) {
        return this.embeddedState.availableViewTypes.includes(viewType);
    }

    /**
     * Refresh current view
     */
    refreshEmbeddedView() {
        if (! this.embeddedState.currentResModel) return;

        this.embeddedState.loading = true;
        this.embeddedState.viewProps = null;

        setTimeout(() => {
            this.buildDynamicViewProps(
                this.embeddedState.currentResModel,
                this.embeddedState.currentViewType,
                this.embeddedState.currentDomain,
                this.embeddedState.currentContext,
                this.embeddedState.currentResId
            );
            this.embeddedState.loading = false;
        }, 100);
    }

    // ==================== APP EMBEDDING ====================

    async loadEmbeddedApp(app) {
        if (!app) return;

        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;

        try {
            const menuData = await this.orm.call(
                "ir.ui.menu",
                "get_menu_with_all_children",
                [app.id]
            );

            this.embeddedState.isEmbeddedMode = true;
            this.embeddedState.currentApp = app;
            this.embeddedState.currentMenus = menuData?.children || [];
            this.embeddedState.breadcrumbs = [{ id: app.id, name: app.name, type: 'app' }];
            this.embeddedState.viewTitle = app.name;
            this.state.currentView = "embedded";

            let actionId = menuData?.action_id;
            let actionMenu = null;

            if (! actionId && menuData?.children?.length) {
                actionMenu = this.findFirstMenuWithAction(menuData.children);
                if (actionMenu) {
                    actionId = actionMenu.action_id;
                    this.embeddedState.breadcrumbs.push({
                        id: actionMenu.id,
                        name: actionMenu.name,
                        type: 'menu'
                    });
                    this.embeddedState.viewTitle = actionMenu.name;
                }
            }

            if (actionId) {
                await this.loadActionById(actionId);
            } else {
                this.embeddedState.errorMessage = _t("No action found for ") + app.name;
            }

        } catch (error) {
            console.error("Failed to open app:", error);
            this.embeddedState.errorMessage = _t("Failed to open ") + app.name;
        } finally {
            this.embeddedState.loading = false;
        }
    }

    /**
     * Load action by ID and set up embedded view
     */
    async loadActionById(actionId) {
        try {
            const numericId = this.extractActionId(actionId);
            if (!numericId) {
                throw new Error("Invalid action ID");
            }

            const actionData = await this.orm.call(
                "ir.actions.act_window",
                "read",
                [[numericId]],
                { fields: ["res_model", "view_mode", "domain", "context", "name", "views"] }
            );

            if (actionData && actionData.length) {
                const action = actionData[0];
                const viewModes = (action.view_mode || "list").split(",");
                let viewType = viewModes[0].trim();
                if (viewType === "tree") viewType = "list";

                const domain = this.parseDomain(action.domain);
                const context = this.parseContext(action.context);

                this.embeddedState.currentResModel = action.res_model;
                this.embeddedState.currentViewType = viewType;
                this.embeddedState.currentDomain = domain;
                this.embeddedState.currentContext = context;
                this.embeddedState.currentResId = false;

                if (action.name) {
                    this.embeddedState.viewTitle = action.name;
                }

                await this.loadAvailableViewTypes(action.res_model);

                if (! this.embeddedState.availableViewTypes.includes(viewType)) {
                    viewType = this.embeddedState.availableViewTypes[0] || "list";
                    this.embeddedState.currentViewType = viewType;
                }

                this.buildDynamicViewProps(action.res_model, viewType, domain, context);
            }

        } catch (error) {
            console.error("Failed to load action:", error);
            throw error;
        }
    }

    /**
     * Parse domain from action - handle all formats
     */
    parseDomain(domainValue) {
        if (!domainValue) return [];
        
        if (Array.isArray(domainValue)) {
            return this.cleanDomain(domainValue);
        }

        if (typeof domainValue === 'string') {
            try {
                let cleaned = domainValue
                    .replace(/'/g, '"')
                    .replace(/True/g, 'true')
                    .replace(/False/g, 'false')
                    .replace(/None/g, 'null')
                    .replace(/\buid\b/g, String(this.userId || 1));
                
                const parsed = JSON.parse(cleaned);
                return this.cleanDomain(parsed);
            } catch (e) {
                console.warn("Could not parse domain:", domainValue);
                return [];
            }
        }

        return [];
    }

    /**
     * Parse context from action
     */
    parseContext(contextValue) {
        if (!contextValue) return {};
        
        if (typeof contextValue === 'object' && ! Array.isArray(contextValue)) {
            return contextValue;
        }

        if (typeof contextValue === 'string') {
            try {
                let cleaned = contextValue
                    .replace(/'/g, '"')
                    .replace(/True/g, 'true')
                    .replace(/False/g, 'false')
                    .replace(/None/g, 'null')
                    .replace(/\buid\b/g, String(this.userId || 1));
                
                return JSON.parse(cleaned);
            } catch (e) {
                console.warn("Could not parse context:", contextValue);
                return {};
            }
        }

        return {};
    }

    /**
     * Extract numeric action ID
     */
    extractActionId(actionId) {
        if (typeof actionId === 'number') {
            return actionId;
        }
        if (typeof actionId === 'string') {
            const match = actionId.match(/(\d+)$/);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        return null;
    }

    /**
     * Handle menu click in embedded app
     */
    async onEmbeddedMenuClick(menu) {
        if (!menu) return;

        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;

        try {
            const appCrumb = this.embeddedState.breadcrumbs[0];
            this.embeddedState.breadcrumbs = [
                appCrumb,
                { id: menu.id, name: menu.name, type: 'menu' }
            ];
            this.embeddedState.viewTitle = menu.name;
            this.embeddedState.currentResId = false;

            if (menu.action_id) {
                await this.loadActionById(menu.action_id);
            } else if (menu.children?.length) {
                const firstChild = this.findFirstMenuWithAction(menu.children);
                if (firstChild) {
                    this.embeddedState.breadcrumbs.push({
                        id: firstChild.id,
                        name: firstChild.name,
                        type: 'submenu'
                    });
                    this.embeddedState.viewTitle = firstChild.name;
                    await this.loadActionById(firstChild.action_id);
                }
            }

        } catch (error) {
            console.error("Failed to load menu:", error);
            this.embeddedState.errorMessage = _t("Failed to load menu");
        } finally {
            this.embeddedState.loading = false;
        }
    }

    /**
     * Find first menu with action recursively
     */
    findFirstMenuWithAction(menus) {
        for (const menu of menus) {
            if (menu.action_id) return menu;
            if (menu.children?.length) {
                const found = this.findFirstMenuWithAction(menu.children);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Close embedded view
     */
    closeEmbeddedView() {
        this.embeddedState.isEmbeddedMode = false;
        this.embeddedState.currentApp = null;
        this.embeddedState.currentMenus = [];
        this.embeddedState.breadcrumbs = [];
        this.embeddedState.viewTitle = "";
        this.embeddedState.currentResModel = null;
        this.embeddedState.currentResId = false;
        this.embeddedState.currentDomain = [];
        this.embeddedState.currentContext = {};
        this.embeddedState.currentViewType = "list";
        this.embeddedState.availableViewTypes = [];
        this.embeddedState.viewProps = null;
        this.embeddedState.errorMessage = null;
        this.state.currentView = "home";
        this.state.activeMainTab = "myspace";

        setTimeout(() => this.renderCharts(), 300);
    }

    /**
     * Handle breadcrumb navigation
     */
    onBreadcrumbClick(crumb, index) {
        if (index === this.embeddedState.breadcrumbs.length - 1) {
            return;
        }

        if (index === 0 && crumb.type === 'app') {
            this.loadEmbeddedApp(this.embeddedState.currentApp);
            return;
        }

        const removedCrumbs = this.embeddedState.breadcrumbs.slice(index + 1);
        this.embeddedState.breadcrumbs = this.embeddedState.breadcrumbs.slice(0, index + 1);
        
        const lastRecordCrumb = removedCrumbs.find(c => c.type === 'record' || c.type === 'new');
        if (lastRecordCrumb) {
            const viewType = lastRecordCrumb.previousViewType || "list";
            this.embeddedState.currentViewType = viewType;
            this.embeddedState.currentResId = false;
            this.embeddedState.viewTitle = crumb.name;
            
            this.buildDynamicViewProps(
                this.embeddedState.currentResModel,
                viewType,
                this.embeddedState.currentDomain,
                this.embeddedState.currentContext
            );
        }
    }

    // ==================== DATA LOADERS ====================

    async loadPhase4Data() {
        await Promise.all([
            this.loadLeaveBalances(),
            this.loadTeamMembers(),
            this.loadSkills(),
        ]);
    }

    async loadLeaveBalances() {
        try {
            if (!this.state.employee?.id) return;

            const allocations = await this.orm.searchRead(
                "hr.leave.allocation",
                [
                    ["employee_id", "=", this.state.employee.id],
                    ["state", "=", "validate"],
                ],
                ["holiday_status_id", "number_of_days", "leaves_taken"],
                { limit: 10 }
            );

            this.state.leaveBalances = allocations.map(a => ({
                id: a.id,
                type: a.holiday_status_id ?  a.holiday_status_id[1] : 'Unknown',
                allocated: a.number_of_days || 0,
                taken: a.leaves_taken || 0,
                remaining: (a.number_of_days || 0) - (a.leaves_taken || 0),
            }));
        } catch (error) {
            this.state.leaveBalances = [];
        }
    }

    async loadTeamMembers() {
        try {
            if (!this.state.employee?.department_id) return;

            const members = await this.orm.searchRead(
                "hr.employee",
                [
                    ["department_id", "=", this.state.employee.department_id[0]],
                    ["id", "!=", this.state.employee.id],
                ],
                ["id", "name", "job_id", "image_128", "attendance_state"],
                { limit: 8 }
            );

            this.state.teamMembers = members.map(m => ({
                id: m.id,
                name: m.name,
                job: m.job_id ? m.job_id[1] : "",
                image: m.image_128,
                status: m.attendance_state,
            }));
        } catch (error) {
            this.state.teamMembers = [];
        }
    }

    async loadSkills() {
        try {
            if (!this.state.employee?.id) return;

            const skills = await this.orm.searchRead(
                "hr.employee.skill",
                [["employee_id", "=", this.state.employee.id]],
                ["skill_id", "skill_type_id", "level_progress"],
                { limit: 6 }
            );

            this.state.skills = skills.map(s => ({
                id: s.id,
                name: s.skill_id ? s.skill_id[1] : 'Unknown',
                type: s.skill_type_id ? s.skill_type_id[1] : '',
                progress: s.level_progress || 0,
            }));
        } catch (error) {
            this.state.skills = [];
        }
    }

    // ==================== TIMER & CLOCK ====================

    startClockTimer() {
        this.clockInterval = setInterval(() => {
            this.state.currentTime = new Date();
        }, 1000);
    }

    startAnnouncementSlider() {
        if (this.state.announcements.length > 1) {
            this.announcementInterval = setInterval(() => {
                this.state.currentAnnouncementIndex =
                    (this.state.currentAnnouncementIndex + 1) % this.state.announcements.length;
            }, 5000);
        }
    }

    get formattedCurrentTime() {
        return this.state.currentTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    get formattedCurrentDate() {
        return this.state.currentTime.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    get currentAnnouncement() {
        if (! this.state.announcements.length) return null;
        return this.state.announcements[this.state.currentAnnouncementIndex];
    }

    initializeTimer() {
        if (this.state.employee?.attendance_state === "checked_in") {
            this.state.timerRunning = true;
            this.startTimer();
        }
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (this.state.timerRunning) {
                this.state.timerSeconds++;
            }
        }, 1000);
    }

    get formattedTimer() {
        const hours = Math.floor(this.state.timerSeconds / 3600);
        const minutes = Math.floor((this.state.timerSeconds % 3600) / 60);
        const seconds = this.state.timerSeconds % 60;
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    // ==================== DATA LOADING ====================

    async loadChartLibrary() {
        try {
            if (typeof Chart === "undefined") {
                await loadJS("https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js");
            }
            this.state.chartLoaded = true;
        } catch (error) {
            this.state.chartLoaded = false;
        }
    }

    async loadInitialData() {
        try {
            try {
                this.state.isManager = await this.orm.call("hr.employee", "check_user_group", []);
            } catch (e) {
                this.state.isManager = false;
            }

            try {
                const empDetails = await this.orm.call("hr.employee", "get_user_employee_details", []);
                if (empDetails && empDetails[0]) {
                    this.state.employee = empDetails[0];
                    this.state.attendance = empDetails[0].attendance_lines || [];
                    this.state.leaves = empDetails[0].leave_lines || [];
                    this.state.expenses = empDetails[0].expense_lines || [];
                }
            } catch (e) {
                console.error("Failed to load employee details:", e);
            }

            try {
                const projects = await this.orm.call("hr.employee", "get_employee_project_tasks", []);
                this.state.projects = projects || [];
            } catch (e) {
                this.state.projects = [];
            }

            try {
                const upcoming = await this.orm.call("hr.employee", "get_upcoming", []);
                if (upcoming) {
                    this.state.birthdays = upcoming.birthday || [];
                    this.state.events = upcoming.event || [];
                    this.state.announcements = upcoming.announcement || [];
                }
            } catch (e) {
                console.error("Failed to load upcoming:", e);
            }

            await this.loadChartData();

            if (this.state.isManager && ! this.contentTabs.find(t => t.id === 'manager')) {
                this.contentTabs.push({ id: "manager", label: "Manager View" });
            }

            await this.loadApps();
        } catch (error) {
            console.error("Failed to load initial data:", error);
        } finally {
            this.state.loading = false;
        }
    }

    async loadChartData() {
        try {
            const leaveData = await this.orm.call("hr.employee", "employee_leave_trend", []);
            this.state.leaveChartData = leaveData || [];

            if (this.state.isManager) {
                const deptData = await this.orm.call("hr.employee", "get_dept_employee", []);
                this.state.deptChartData = deptData || [];
            }
        } catch (error) {
            console.error("Failed to load chart data:", error);
        }
    }

    async loadApps() {
        try {
            this.state.apps = await this.orm.call("ir.ui.menu", "get_zoho_apps", []);
        } catch (error) {
            this.state.apps = [];
        }
    }

    renderCharts() {
        if (! this.state.chartLoaded || typeof Chart === "undefined") return;
        setTimeout(() => {
            this.renderLeaveChart();
            if (this.state.isManager) {
                this.renderDeptChart();
            }
        }, 500);
    }

    renderLeaveChart() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoLeaveChart");
        if (!canvas || !this.state.leaveChartData.length) return;

        if (this.leaveChartInstance) this.leaveChartInstance.destroy();

        try {
            const ctx = canvas.getContext("2d");
            this.leaveChartInstance = new Chart(ctx, {
                type: "line",
                data: {
                    labels: this.state.leaveChartData.map(d => d.l_month),
                    datasets: [{
                        label: "Leaves",
                        data: this.state.leaveChartData.map(d => d.leave),
                        backgroundColor: "rgba(26, 115, 232, 0.2)",
                        borderColor: "rgba(26, 115, 232, 1)",
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true } },
                    scales: { y: { beginAtZero: true } },
                },
            });
        } catch (error) {
            console.error("Failed to render chart:", error);
        }
    }

    renderDeptChart() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoDeptChart");
        if (!canvas || !this.state.deptChartData.length) return;

        if (this.deptChartInstance) this.deptChartInstance.destroy();

        try {
            const ctx = canvas.getContext("2d");
            const colors = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"];

            this.deptChartInstance = new Chart(ctx, {
                type: "doughnut",
                data: {
                    labels: this.state.deptChartData.map(d => d.label),
                    datasets: [{
                        data: this.state.deptChartData.map(d => d.value),
                        backgroundColor: colors.slice(0, this.state.deptChartData.length),
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "right" } },
                },
            });
        } catch (error) {
            console.error("Failed to render chart:", error);
        }
    }

    get filteredApps() {
        if (!this.state.searchQuery) return this.state.apps;
        const query = this.state.searchQuery.toLowerCase();
        return this.state.apps.filter(app => app.name.toLowerCase().includes(query));
    }

    // ==================== NAVIGATION ====================

    onMainTabClick(tabId) {
        if (this.embeddedState.isEmbeddedMode) {
            this.closeEmbeddedView();
        }

        this.state.activeMainTab = tabId;
        if (tabId === "myspace") {
            this.state.currentView = "home";
            setTimeout(() => this.renderCharts(), 300);
        }
        else if (tabId === "team") this.state.currentView = "team";
        else if (tabId === "organization") this.state.currentView = "organization";
    }

    onSidebarClick(item) {
        if (item.action === "home") {
            this.closeEmbeddedView();
            this.state.currentView = "home";
            this.state.activeTab = "activities";
            this.state.activeMainTab = "myspace";
            setTimeout(() => this.renderCharts(), 300);
        } else if (item.action === "operations") {
            if (this.embeddedState.isEmbeddedMode) {
                this.closeEmbeddedView();
            }
            this.state.currentView = "operations";
        } else if (item.action === "profile") {
            if (this.embeddedState.isEmbeddedMode) {
                this.closeEmbeddedView();
            }
            this.state.currentView = "profile";
        } else if (item.model) {
            this.openSidebarModel(item);
        }
    }

    openSidebarModel(item) {
        let domain = [];
        if (this.state.employee?.id) {
            const employeeDomainModels = [
                "hr.leave", "hr.attendance", "hr.payslip", 
                "hr.expense", "hr.contract"
            ];
            if (employeeDomainModels.includes(item.model)) {
                domain = [["employee_id", "=", this.state.employee.id]];
            } else if (item.model === "account.analytic.line") {
                domain = [["project_id", "!=", false]];
            }
        }
        this.loadEmbeddedView(item.model, item.title || item.label, domain);
    }

    onTabClick(tabId) {
        this.state.activeTab = tabId;
        if (tabId === "activities") setTimeout(() => this.renderLeaveChart(), 300);
        if (tabId === "manager" && this.state.isManager) setTimeout(() => this.renderDeptChart(), 300);
    }

    onSearchInput(event) {
        this.state.searchQuery = event.target.value;
    }

    getAppIcon(app) {
        if (app.web_icon_data) return "data:image/png;base64," + app.web_icon_data;
        if (app.web_icon) {
            const parts = app.web_icon.split(",");
            if (parts.length === 2) return "/" + parts[0] + "/static/" + parts[1];
        }
        return null;
    }

    // ==================== APP CLICK ====================

    async onAppClick(app) {
        if (! app) return;

        const appName = (app.name || "").toLowerCase();

        const fullPageApps = ["settings", "apps", "general settings", "users"];
        if (fullPageApps.some(name => appName.includes(name))) {
            window.location.href = `/web#menu_id=${app.id}`;
            return;
        }

        await this.loadEmbeddedApp(app);
    }

    // ==================== CHECK IN/OUT ====================

    async onCheckInOut() {
        try {
            await this.orm.call("hr.employee", "attendance_manual", [[]]);

            if (this.state.employee?.attendance_state === "checked_out") {
                this.state.employee.attendance_state = "checked_in";
                this.state.timerRunning = true;
                this.state.timerSeconds = 0;
                this.startTimer();
                this.notification.add(_t("Successfully Checked In"), { type: "success" });
            } else if (this.state.employee) {
                this.state.employee.attendance_state = "checked_out";
                this.state.timerRunning = false;
                if (this.timerInterval) clearInterval(this.timerInterval);
                this.notification.add(_t("Successfully Checked Out"), { type: "success" });
            }

            await this.refreshEmployeeData();
        } catch (error) {
            this.notification.add(_t("Check in/out failed"), { type: "danger" });
        }
    }

    async refreshEmployeeData() {
        try {
            const empDetails = await this.orm.call("hr.employee", "get_user_employee_details", []);
            if (empDetails?.[0]) {
                this.state.employee = empDetails[0];
                this.state.attendance = empDetails[0].attendance_lines || [];
                this.state.leaves = empDetails[0].leave_lines || [];
                this.state.expenses = empDetails[0].expense_lines || [];
            }
        } catch (e) {
            console.error("Failed to refresh:", e);
        }
    }

    // ==================== QUICK ACTIONS ====================

    async addAttendance() {
        await this.actionService.doAction({
            name: _t("New Attendance"),
            type: "ir.actions.act_window",
            res_model: "hr.attendance",
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
            context: { default_employee_id: this.state.employee?.id },
        });
    }

    async addLeave() {
        await this.actionService.doAction({
            name: _t("New Leave Request"),
            type: "ir.actions.act_window",
            res_model: "hr.leave",
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
            context: { default_employee_id: this.state.employee?.id },
        });
    }

    async addExpense() {
        await this.actionService.doAction({
            name: _t("New Expense"),
            type: "ir.actions.act_window",
            res_model: "hr.expense",
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
            context: { default_employee_id: this.state.employee?.id },
        });
    }

    async addProject() {
        await this.actionService.doAction({
            name: _t("New Task"),
            type: "ir.actions.act_window",
            res_model: "project.task",
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
        });
    }

    // ==================== STAT CARD CLICKS ====================

    openPayslips() {
        this.loadEmbeddedView("hr.payslip", "My Payslips",
            this.state.employee?.id ? [["employee_id", "=", this.state.employee.id]] : []);
    }

    openTimesheets() {
        this.loadEmbeddedView("account.analytic.line", "My Timesheets",
            [["project_id", "!=", false]]);
    }

    openContracts() {
        this.loadEmbeddedView("hr.contract", "My Contracts",
            this.state.employee?.id ? [["employee_id", "=", this.state.employee.id]] : []);
    }

    openLeaveRequests() {
        this.loadEmbeddedView("hr.leave", "Leave Requests",
            [["state", "in", ["confirm", "validate1"]]]);
    }

    openLeavesToday() {
        const today = new Date().toISOString().split("T")[0];
        this.loadEmbeddedView("hr.leave", "Leaves Today",
            [["date_from", "<=", today], ["date_to", ">=", today], ["state", "=", "validate"]]);
    }

    openJobApplications() {
        this.loadEmbeddedView("hr.applicant", "Job Applications", [], "kanban");
    }

    async openProfile() {
        if (this.state.employee?.id) {
            await this.actionService.doAction({
                name: _t("My Profile"),
                type: "ir.actions.act_window",
                res_model: "hr.employee",
                res_id: this.state.employee.id,
                view_mode: "form",
                views: [[false, "form"]],
                target: "new",
            });
        }
    }

    openAllAttendance() {
        this.loadEmbeddedView("hr.attendance", "My Attendance",
            this.state.employee?.id ? [["employee_id", "=", this.state.employee.id]] : []);
    }

    openAllLeaves() {
        this.loadEmbeddedView("hr.leave", "My Leaves",
            this.state.employee?.id ? [["employee_id", "=", this.state.employee.id]] : []);
    }

    openAllExpenses() {
        this.loadEmbeddedView("hr.expense", "My Expenses",
            this.state.employee?.id ? [["employee_id", "=", this.state.employee.id]] : []);
    }

    openAllProjects() {
        this.loadEmbeddedView("project.task", "My Tasks", [], "kanban");
    }

    openAllEmployees() {
        this.loadEmbeddedView("hr.employee", "Employees", [], "kanban");
    }

    openDepartments() {
        this.loadEmbeddedView("hr.department", "Departments", []);
    }

    openOrgChart() {
        this.loadEmbeddedView("hr.employee", "Organization", [], "kanban");
    }

    async openTeamMember(member) {
        await this.actionService.doAction({
            name: member.name,
            type: "ir.actions.act_window",
            res_model: "hr.employee",
            res_id: member.id,
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
        });
    }

    // ==================== ROW CLICKS ====================

    async onAttendanceRowClick(att) {
        await this.actionService.doAction({
            name: _t("Attendance"),
            type: "ir.actions.act_window",
            res_model: "hr.attendance",
            res_id: att.id,
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
        });
    }

    async onLeaveRowClick(leave) {
        await this.actionService.doAction({
            name: _t("Leave Request"),
            type: "ir.actions.act_window",
            res_model: "hr.leave",
            res_id: leave.id,
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
        });
    }

    async onExpenseRowClick(exp) {
        await this.actionService.doAction({
            name: _t("Expense"),
            type: "ir.actions.act_window",
            res_model: "hr.expense",
            res_id: exp.id,
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
        });
    }

    async onProjectRowClick(proj) {
        await this.actionService.doAction({
            name: _t("Task"),
            type: "ir.actions.act_window",
            res_model: "project.task",
            res_id: proj.id,
            view_mode: "form",
            views: [[false, "form"]],
            target: "new",
        });
    }
}

// Register the dashboard action
registry.category("actions").add("hr_dashboard_spa", ZohoDashboard);