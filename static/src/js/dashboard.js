/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState, onMounted, onWillStart, onWillUnmount, useRef, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { loadJS, loadBundle } from "@web/core/assets";
import { View } from "@web/views/view";


/**
 * Dynamic component wrapper that renders any component passed to it.
 * This allows us to render client actions within our component tree,
 * giving them access to all globally registered templates.
 */
class DynamicAction extends Component {
    static template = xml`<t t-component="props.component" t-props="componentProps"/>`;
    static props = ["component", "action", "actionId", "*"];
    
    get componentProps() {
        // Spread all props except 'component' to the child
        const { component, ...rest } = this.props;
        return rest;
    }
}

export class ZohoDashboard extends Component {
    static template = "hrms_dashboard.ZohoDashboard";
    static props = ["*"];
    static components = { View, DynamicAction };

    setup() {
        // Core Services
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");

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
            fabOpen: false,
            currentActionId: null,
            isClientAction: false,
            clientActionMounted: false,
            // Dynamic client action component
            clientActionComponent: null,
            clientActionProps: null,
            // NEW: Track active sidebar item for proper highlighting
            activeSidebarItem: null,
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

        // Navigation items - some use action IDs for proper dashboard loading
        this.sidebarItems = [
            { id: "home", icon: "🏠", label: "Home", action: "home" },
            { id: "profile", icon: "👤", label: "Profile", action: "profile" },
            { id: "leave", icon: "📅", label: "Leave", model: "hr.leave", title: "Time Off" },
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

        // Store original doAction
        this._originalDoAction = this.actionService.doAction.bind(this.actionService);
        
        // Patch the action service globally for this component
        this.patchActionService();

        // Also patch the restore method which handles breadcrumb navigation
        this.patchActionRestore();

        // Add to class properties in setup()
        this.actionStack = [];

        // No internal holders needed - using state for dynamic component

        // Lifecycle
        onWillStart(async () => {
            await this.loadChartLibrary();
            await this.loadInitialData();
            await this.loadPhase4Data();
        });

        onMounted(() => {
            this.initializeTimer();
            this.startClockTimer();
            this.startAnnouncementSlider();
            this.setupPersistentFrame();
            this.setupStatButtonInterceptor();
            if (this.state.chartLoaded) {
                this.renderCharts();
            }
            console.log("🏠 Dashboard mounted");
        });

        onWillUnmount(() => {
            this.cleanup();
        });

        // Inject CSS to constrain Odoo actions within the container
        this.injectActionContainerStyles();

        // Intercept browser history changes when in SPA mode
        this.setupRouterInterception();
    }

    /**
     * Patch the action service restore method to handle back navigation
     */
    patchActionRestore() {
        const self = this;
        if (this.actionService.restore) {
            this._originalRestore = this.actionService.restore.bind(this.actionService);
            this.actionService.restore = (actionId) => {
                if (self.embeddedState.isEmbeddedMode) {
                    // Handle restore within SPA
                    console.log("🔙 Intercepted restore:", actionId);
                    if (self.actionStack.length > 0) {
                        self.goBackInActionStack();
                        return;
                    }
                }
                return self._originalRestore(actionId);
            };
        }
    }

    // New method - Global action service patch
    patchActionService() {
        const self = this;
        const originalDoAction = this._originalDoAction;

        this.actionService.doAction = async (actionRequest, options = {}) => {
            // Only intercept when in embedded mode
            if (!self.embeddedState.isEmbeddedMode) {
                return originalDoAction(actionRequest, options);
            }

            console.log("🎯 Intercepted action:", actionRequest, "options:", options);

            // Handle different action request formats
            if (typeof actionRequest === "number" || typeof actionRequest === "string") {
                // Check if it's a window action we should embed
                try {
                    const numericId = self.extractActionId(actionRequest);
                    if (numericId) {
                        console.log("📍 Loading action by ID in embedded mode:", numericId);
                        // Prevent full page navigation - load in embedded mode
                        return await self.loadActionById(numericId);
                    }
                } catch (e) {
                    console.warn("Action load failed, using fallback:", e);
                    // Fallback to original
                    return originalDoAction(actionRequest, options);
                }
            }

            // Handle action objects
            if (actionRequest?.type === "ir.actions.act_window") {
                // Dialogs should use original behavior
                if (options.target === "new" || actionRequest.target === "new") {
                    console.log("📝 Opening dialog (target=new)");
                    return originalDoAction(actionRequest, options);
                }

                // CRITICAL: Intercept ALL window actions when in embedded mode
                // This prevents smart buttons from taking full page
                console.log("🔄 Handling window action in embedded mode:", actionRequest.res_model);
                return await self.handleWindowActionInEmbedded(actionRequest, options);
            }

            if (actionRequest?.type === "ir.actions.client") {
                const actionId = actionRequest.id || actionRequest.action_id;
                if (actionId) {
                    console.log("📱 Loading client action:", actionId);
                    return self.loadClientAction(actionId);
                }
                if (actionRequest.tag) {
                    console.log("📱 Loading client action by tag:", actionRequest.tag);
                    return self.loadClientActionByTag(actionRequest.tag, actionRequest);
                }
            }

            // For URL actions, open in new tab to prevent leaving SPA
            if (actionRequest?.type === "ir.actions.act_url") {
                if (actionRequest.target !== "self") {
                    window.open(actionRequest.url, "_blank");
                    self.notification.add(_t("Link opened in new tab"), { type: "info" });
                    return;
                }
                // For "self" target, still open in new tab to preserve SPA
                window.open(actionRequest.url, "_blank");
                self.notification.add(_t("Link opened in new tab"), { type: "info" });
                return;
            }

            // Server actions - execute and handle result
            if (actionRequest?.type === "ir.actions.server") {
                console.log("⚙️ Executing server action");
                if (actionRequest.id) {
                    return await self.executeServerAction(actionRequest.id);
                }
            }

            // Report actions - open in new tab
            if (actionRequest?.type === "ir.actions.report") {
                console.log("📄 Opening report");
                if (actionRequest.report_name) {
                    const reportUrl = `/report/${actionRequest.report_type || 'qweb-pdf'}/${actionRequest.report_name}`;
                    window.open(reportUrl, "_blank");
                    self.notification.add(_t("Report opened in new tab"), { type: "info" });
                    return;
                }
                if (actionRequest.id) {
                    return await self.executeReportAction(actionRequest.id);
                }
            }

            console.log("⚠️ Unhandled action type, using fallback");
            // All other actions use original behavior
            return originalDoAction(actionRequest, options);
        };
    }

    /**
     * Handle window actions (ir.actions.act_window) within embedded mode
     * This is the main handler for stat buttons and navigation within forms
     */
    async handleWindowActionInEmbedded(actionRequest, options = {}) {
        console.log("🔄 handleWindowActionInEmbedded:", actionRequest.res_model);
        
        // CRITICAL: Ensure we stay in embedded mode
        this.embeddedState.isEmbeddedMode = true;
        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;
        this.embeddedState.clientActionComponent = null;
        this.embeddedState.clientActionProps = null;
        this.embeddedState.isClientAction = false;
        this.state.currentView = "embedded";

        const viewModes = (actionRequest.view_mode || "list").split(",");
        let viewType = (viewModes[0] || "list").trim();
        if (viewType === "tree") viewType = "list";

        // Determine if we have a specific record
        let resId = actionRequest.res_id || false;
        
        // If views include form and we have res_id, prioritize form view
        if (resId && actionRequest.views) {
            const formView = actionRequest.views.find(v => v[1] === "form");
            if (formView) {
                viewType = "form";
            }
        }

        // Parse domain and context
        let domain = [];
        if (actionRequest.domain) {
            domain = Array.isArray(actionRequest.domain) 
                ? this.cleanDomain(actionRequest.domain)
                : this.parseDomainSafe(actionRequest.domain);
        }

        let context = {};
        if (actionRequest.context) {
            context = typeof actionRequest.context === 'object' 
                ? this.cleanContext(actionRequest.context)
                : this.parseContextSafe(actionRequest.context);
        }

        // Push current state to stack if we have a model loaded and it's different
        const shouldPushStack = this.embeddedState.currentResModel && 
            (this.embeddedState.currentResModel !== actionRequest.res_model ||
             this.embeddedState.currentResId !== resId);
             
        if (shouldPushStack) {
            this.actionStack.push({
                resModel: this.embeddedState.currentResModel,
                viewType: this.embeddedState.currentViewType,
                domain: [...(this.embeddedState.currentDomain || [])],
                context: {...(this.embeddedState.currentContext || {})},
                resId: this.embeddedState.currentResId,
                title: this.embeddedState.viewTitle,
                breadcrumbs: [...this.embeddedState.breadcrumbs],
                isClientAction: this.embeddedState.isClientAction,
                actionId: this.embeddedState.currentActionId,
                viewProps: this.embeddedState.viewProps,
            });
            console.log("📚 Pushed to action stack, depth:", this.actionStack.length);
        }

        // Update breadcrumbs
        const actionName = actionRequest.name || actionRequest.display_name || actionRequest.res_model;
        const newBreadcrumb = {
            name: actionName,
            type: 'action',
            resModel: actionRequest.res_model,
            previousViewType: this.embeddedState.currentViewType,
            actionId: actionRequest.id,
        };
        this.embeddedState.breadcrumbs = [...this.embeddedState.breadcrumbs, newBreadcrumb];

        // Update state
        this.embeddedState.currentResModel = actionRequest.res_model;
        this.embeddedState.currentViewType = viewType;
        this.embeddedState.currentDomain = domain;
        this.embeddedState.currentContext = context;
        this.embeddedState.currentResId = resId;
        this.embeddedState.viewTitle = actionName;
        
        if (actionRequest.id) {
            this.embeddedState.currentActionId = actionRequest.id;
        }

        // Load bundles
        await this.loadViewBundles(actionRequest.res_model, viewType);
        await this.loadAvailableViewTypes(actionRequest.res_model);

        // Adjust view type if not available
        if (!this.embeddedState.availableViewTypes.includes(viewType)) {
            viewType = this.embeddedState.availableViewTypes[0] || "list";
            this.embeddedState.currentViewType = viewType;
        }

        // Build the view
        if (viewType === "calendar") {
            await this.loadCalendarViaAction(actionRequest.res_model, actionName, domain, context);
        } else {
            this.buildDynamicViewProps(actionRequest.res_model, viewType, domain, context, resId);
        }
        
        console.log("✅ Window action handled in embedded mode:", actionRequest.res_model, viewType);
    }

    /**
     * Handle window actions (ir.actions.act_window) - Used by stat buttons
     */
    async handleWindowAction(actionRequest, options = {}) {
        const resModel = actionRequest.res_model;
        if (!resModel) {
            console.warn("Window action without res_model, using original");
            return this._originalDoAction(actionRequest, options);
        }

        // Parse view modes
        const viewModes = (actionRequest.view_mode || "list,form").split(",");
        let viewType = viewModes[0].trim();
        if (viewType === "tree") viewType = "list";

        // Parse domain - handle various formats
        let domain = [];
        if (actionRequest.domain) {
            if (typeof actionRequest.domain === 'string') {
                domain = this.parseDomainSafe(actionRequest.domain);
            } else if (Array.isArray(actionRequest.domain)) {
                domain = this.cleanDomain(actionRequest.domain);
            }
        }

        // Parse context
        let context = {};
        if (actionRequest.context) {
            if (typeof actionRequest.context === 'string') {
                context = this.parseContextSafe(actionRequest.context);
            } else if (typeof actionRequest.context === 'object') {
                context = this.cleanContext(actionRequest.context);
            }
        }

        // Determine if this is a single record view
        const resId = actionRequest.res_id || false;
        if (resId && viewType !== "form") {
            // If we have a specific record ID and it's not already form view,
            // check if we should switch to form
            const views = actionRequest.views || [];
            const hasFormView = views.some(v => v[1] === "form");
            if (hasFormView) {
                viewType = "form";
            }
        }

        // Save current state to stack for back navigation
        this.pushCurrentStateToStack();

        // Update embedded state
        this.embeddedState.currentResModel = resModel;
        this.embeddedState.currentViewType = viewType;
        this.embeddedState.currentDomain = domain;
        this.embeddedState.currentContext = context;
        this.embeddedState.currentResId = resId;
        this.embeddedState.viewTitle = actionRequest.name || actionRequest.display_name || resModel;
        this.embeddedState.isClientAction = false;

        // Update action ID
        if (actionRequest.id) {
            this.embeddedState.currentActionId = actionRequest.id;
        }

        // Update breadcrumbs
        this.embeddedState.breadcrumbs.push({
            name: actionRequest.name || resModel,
            type: 'action',
            resModel: resModel,
            previousViewType: viewType
        });

        console.log("📊 Loading embedded view:", { resModel, viewType, domain, resId });

        // Load required bundles
        await this.loadViewBundles(resModel, viewType);

        // Load available view types
        await this.loadAvailableViewTypes(resModel);

        // Adjust view type if not available
        if (!this.embeddedState.availableViewTypes.includes(viewType)) {
            viewType = this.embeddedState.availableViewTypes[0] || "list";
            this.embeddedState.currentViewType = viewType;
        }

        // Build and render the view
        if (viewType === "calendar") {
            await this.loadCalendarViaAction(resModel, this.embeddedState.viewTitle, domain, context);
        } else {
            this.buildDynamicViewProps(resModel, viewType, domain, context, resId);
        }
    }

    /**
     * Handle URL actions
     */
    handleUrlAction(actionRequest) {
        if (actionRequest.url) {
            if (actionRequest.target === "self") {
                window.location.href = actionRequest.url;
            } else {
                window.open(actionRequest.url, "_blank");
                this.notification.add(_t("Link opened in new tab"), { type: "info" });
            }
        }
    }

    /**
     * Push current state to action stack for back navigation
     */
    pushCurrentStateToStack() {
        if (this.embeddedState.currentResModel || this.embeddedState.isClientAction) {
            this.actionStack.push({
                resModel: this.embeddedState.currentResModel,
                viewType: this.embeddedState.currentViewType,
                domain: [...(this.embeddedState.currentDomain || [])],
                context: {...(this.embeddedState.currentContext || {})},
                resId: this.embeddedState.currentResId,
                title: this.embeddedState.viewTitle,
                breadcrumbs: [...this.embeddedState.breadcrumbs],
                isClientAction: this.embeddedState.isClientAction,
                actionId: this.embeddedState.currentActionId,
                viewProps: this.embeddedState.viewProps,
            });
            console.log("📚 Pushed to action stack, depth:", this.actionStack.length);
        }
    }

     /**
     * Set up interceptor for stat button clicks within embedded views.
     * This ensures stat buttons navigate within the SPA instead of full page.
     * Also intercepts relational field links and other action triggers.
     */
    setupStatButtonInterceptor() {
        const self = this;
        
        // Use event delegation to catch stat button clicks in CAPTURE phase
        this._statButtonClickHandler = async (event) => {
            // Only intercept when in embedded mode
            if (!self.embeddedState.isEmbeddedMode) {
                return;
            }
            
            const target = event.target;
            
            // Helper to check if element is a dropdown TOGGLE (not item)
            const isDropdownToggle = (el) => {
                if (!el || el === document) return false;
                if (el.classList && (
                    el.classList.contains('dropdown-toggle') ||
                    el.classList.contains('o_dropdown_toggler') ||
                    el.classList.contains('o_dropdown_toggler_btn')
                )) return true;
                if (el.hasAttribute && (
                    el.hasAttribute('data-bs-toggle') ||
                    el.hasAttribute('data-toggle') ||
                    el.hasAttribute('aria-expanded')
                )) return true;
                if (el.textContent && el.textContent.trim().toLowerCase() === 'more' && 
                    !el.classList.contains('dropdown-item')) return true;
                return false;
            };
            
            // Check if we're clicking on a dropdown toggle - let those work normally
            let currentEl = target;
            while (currentEl && currentEl !== document) {
                if (isDropdownToggle(currentEl)) {
                    console.log("📋 Allowing dropdown toggle interaction");
                    return; // Let dropdown toggle work normally
                }
                // Stop at dropdown-menu - don't check further up for toggles
                if (currentEl.classList && currentEl.classList.contains('dropdown-menu')) {
                    break;
                }
                currentEl = currentEl.parentElement;
            }
            
            // Check if click is on a dropdown item (button inside dropdown menu)
            // These should be INTERCEPTED, not allowed through
            const dropdownItem = target.closest('.dropdown-item') || target.closest('.dropdown-menu .oe_stat_button');
            if (dropdownItem) {
                const buttonName = dropdownItem.getAttribute('name');
                const buttonType = dropdownItem.getAttribute('type') || dropdownItem.dataset.type;
                
                console.log("📋 Dropdown item clicked:", buttonName, buttonType);
                
                if (buttonType === 'action' && buttonName) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    let actionId = self.extractActionId(buttonName);
                    if (!actionId && buttonName.includes('.')) {
                        actionId = await self.resolveXmlIdToActionId(buttonName);
                    }
                    
                    if (actionId) {
                        console.log("🎯 Intercepting dropdown item action:", actionId);
                        await self.loadActionById(actionId);
                        return;
                    } else {
                        // Try to find action by name
                        try {
                            const action = await self.orm.searchRead(
                                "ir.actions.act_window",
                                ["|", ["xml_id", "ilike", buttonName], ["name", "ilike", buttonName]],
                                ["id"],
                                { limit: 1 }
                            );
                            if (action && action.length) {
                                console.log("🎯 Found dropdown action by name:", action[0].id);
                                await self.loadActionById(action[0].id);
                                return;
                            }
                        } catch (e) {
                            console.warn("Could not find action:", e);
                        }
                    }
                }
                
                if (buttonType === 'object' && buttonName) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    try {
                        const resModel = self.embeddedState.currentResModel;
                        const resId = self.embeddedState.currentResId;
                        
                        if (resModel && resId) {
                            const result = await self.orm.call(
                                resModel,
                                buttonName,
                                [[resId]],
                                { context: self.embeddedState.currentContext || {} }
                            );
                            
                            if (result && typeof result === 'object' && result.type) {
                                await self.actionService.doAction(result);
                            }
                        }
                    } catch (e) {
                        console.error("Error executing method:", e);
                    }
                    return;
                }
            }
            
            // Find if click was on a stat button or its child
            const statButton = target.closest('.oe_stat_button');
            if (statButton) {
                const buttonName = statButton.getAttribute('name');
                const buttonType = statButton.getAttribute('type') || statButton.dataset.type;
                
                // Log all button attributes for debugging
                console.log("📊 Stat button clicked:", {
                    name: buttonName,
                    type: buttonType,
                    class: statButton.className,
                    dataAttrs: { ...statButton.dataset }
                });
                
                // If no name/type, check for data attributes or other patterns
                if (!buttonName && !buttonType) {
                    // Check for data-name or data-action attributes
                    const dataName = statButton.dataset.name;
                    const dataAction = statButton.dataset.action;
                    const dataActionId = statButton.dataset.actionId;
                    
                    if (dataActionId) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        console.log("🎯 Found data-action-id:", dataActionId);
                        await self.loadActionById(dataActionId);
                        return;
                    }
                    
                    if (dataAction) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        let actionId = self.extractActionId(dataAction);
                        if (!actionId && dataAction.includes('.')) {
                            actionId = await self.resolveXmlIdToActionId(dataAction);
                        }
                        if (actionId) {
                            console.log("🎯 Found data-action:", actionId);
                            await self.loadActionById(actionId);
                            return;
                        }
                    }
                    
                    if (dataName) {
                        // Try to find action by data-name
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        let actionId = self.extractActionId(dataName);
                        if (!actionId && dataName.includes('.')) {
                            actionId = await self.resolveXmlIdToActionId(dataName);
                        }
                        if (actionId) {
                            console.log("🎯 Found data-name action:", actionId);
                            await self.loadActionById(actionId);
                            return;
                        }
                    }
                    
                    console.log("📋 Stat button without identifiable action, allowing normal behavior");
                    return;
                }
                
                console.log("📊 Processing stat button:", buttonName, buttonType, "isEmbedded:", self.embeddedState.isEmbeddedMode);
                
                // If it's an action type button
                if (buttonType === 'action' && buttonName) {
                    // CRITICAL: Stop event immediately before OWL processes it
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    // First try to extract numeric ID
                    let actionId = self.extractActionId(buttonName);
                    
                    // If it's an XML ID (contains a dot), resolve it
                    if (!actionId && buttonName.includes('.')) {
                        console.log("🔍 Resolving XML ID:", buttonName);
                        actionId = await self.resolveXmlIdToActionId(buttonName);
                    }
                    
                    if (actionId) {
                        console.log("🎯 Intercepting stat button action:", actionId);
                        await self.loadActionById(actionId);
                        return;
                    } else {
                        console.warn("⚠️ Could not resolve action:", buttonName);
                        // Try to parse as XML ID even without dot
                        // Some actions may use underscores like 'action_open_payslips'
                        try {
                            const action = await self.orm.searchRead(
                                "ir.actions.act_window",
                                ["|", ["xml_id", "ilike", buttonName], ["name", "ilike", buttonName]],
                                ["id"],
                                { limit: 1 }
                            );
                            if (action && action.length) {
                                console.log("🎯 Found action by name search:", action[0].id);
                                await self.loadActionById(action[0].id);
                                return;
                            }
                        } catch (e) {
                            console.warn("Could not find action by name:", e);
                        }
                    }
                }
                
                // If it's an object type button (server method), intercept and handle
                if (buttonType === 'object' && buttonName) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    console.log("🔧 Executing object method:", buttonName);
                    
                    // Execute the method and handle any resulting action
                    try {
                        const resModel = self.embeddedState.currentResModel;
                        const resId = self.embeddedState.currentResId;
                        
                        if (resModel && resId) {
                            const result = await self.orm.call(
                                resModel,
                                buttonName,
                                [[resId]],
                                { context: self.embeddedState.currentContext || {} }
                            );
                            
                            console.log("📊 Method returned:", result);
                            
                            // If the method returns an action, handle it explicitly in embedded mode
                            if (result && typeof result === 'object' && result.type) {
                                console.log("📊 Method returned action:", result.type, result);
                                
                                // Handle window actions directly
                                if (result.type === 'ir.actions.act_window') {
                                    await self.handleWindowActionInEmbedded(result);
                                    return;
                                }
                                
                                // Handle client actions
                                if (result.type === 'ir.actions.client') {
                                    if (result.id) {
                                        await self.loadClientAction(result.id);
                                    } else if (result.tag) {
                                        await self.loadClientActionByTag(result.tag, result);
                                    }
                                    return;
                                }
                                
                                // For other action types, use the patched doAction
                                await self.actionService.doAction(result);
                            }
                        }
                    } catch (e) {
                        console.error("Error executing method:", e);
                        self.notification.add(
                            _t("Error: ") + (e.message || "Failed to execute action"),
                            { type: "danger" }
                        );
                    }
                    return;
                }
                
                // Fallback: If button has a name but no recognized type, try to find an action
                // This handles custom buttons like "Announcements" that may use non-standard patterns
                if (buttonName && !buttonType) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    console.log("🔍 Trying to resolve button without type:", buttonName);
                    
                    // First try as action ID
                    let actionId = self.extractActionId(buttonName);
                    
                    // Try as XML ID
                    if (!actionId && buttonName.includes('.')) {
                        actionId = await self.resolveXmlIdToActionId(buttonName);
                    }
                    
                    // Try searching for action by name
                    if (!actionId) {
                        try {
                            const action = await self.orm.searchRead(
                                "ir.actions.act_window",
                                ["|", "|", 
                                    ["xml_id", "ilike", buttonName], 
                                    ["name", "ilike", buttonName],
                                    ["binding_model_id.model", "=", self.embeddedState.currentResModel]
                                ],
                                ["id", "name"],
                                { limit: 5 }
                            );
                            
                            // Try to find the best matching action
                            if (action && action.length) {
                                // Prefer exact name match
                                const exactMatch = action.find(a => 
                                    a.name && a.name.toLowerCase().includes(buttonName.toLowerCase())
                                );
                                actionId = exactMatch ? exactMatch.id : action[0].id;
                            }
                        } catch (e) {
                            console.warn("Could not find action:", e);
                        }
                    }
                    
                    // Try as an object method (Python method call)
                    if (!actionId) {
                        try {
                            const resModel = self.embeddedState.currentResModel;
                            const resId = self.embeddedState.currentResId;
                            
                            if (resModel && resId) {
                                console.log("🔧 Trying as object method:", buttonName);
                                const result = await self.orm.call(
                                    resModel,
                                    buttonName,
                                    [[resId]],
                                    { context: self.embeddedState.currentContext || {} }
                                );
                                
                                if (result && typeof result === 'object' && result.type) {
                                    console.log("📊 Method returned action:", result.type);
                                    await self.actionService.doAction(result);
                                    return;
                                }
                            }
                        } catch (e) {
                            console.log("Not a callable method:", buttonName);
                        }
                    }
                    
                    if (actionId) {
                        console.log("🎯 Found action for button:", actionId);
                        await self.loadActionById(actionId);
                        return;
                    }
                    
                    console.warn("⚠️ Could not resolve button action:", buttonName);
                }
                
                return;
            }
            
            // Also intercept generic form buttons with action type
            const formButton = target.closest('button[data-type="action"][data-name]');
            if (formButton) {
                const buttonName = formButton.dataset.name;
                console.log("📊 Form button with action clicked:", buttonName);
                
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                
                let actionId = self.extractActionId(buttonName);
                if (!actionId && buttonName.includes('.')) {
                    actionId = await self.resolveXmlIdToActionId(buttonName);
                }
                
                if (actionId) {
                    console.log("🎯 Intercepting form button action:", actionId);
                    await self.loadActionById(actionId);
                    return;
                }
            }
            
            // Intercept relational field links (Many2one clicks in form view)
            const formLink = target.closest('.o_form_uri');
            if (formLink) {
                const href = formLink.getAttribute('href');
                if (href && (href.includes('/odoo/') || href.includes('/web#'))) {
                    // Parse the URL to extract model and id
                    const match = href.match(/model=([^&]+).*id=(\d+)/) || 
                                  href.match(/\/odoo\/([^/]+)\/(\d+)/) ||
                                  href.match(/\/([\w.]+)\/(\d+)/);
                    if (match) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        const model = match[1].replace(/-/g, '.');
                        const resId = parseInt(match[2], 10);
                        console.log("🔗 Intercepting form link:", model, resId);
                        await self.handleSelectRecord(model, resId);
                        return;
                    }
                }
            }
            
            // Intercept button_action_url with data attributes
            const actionButton = target.closest('[data-action-id]');
            if (actionButton) {
                const actionIdAttr = actionButton.getAttribute('data-action-id');
                if (actionIdAttr) {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    let actionId = self.extractActionId(actionIdAttr);
                    if (!actionId && actionIdAttr.includes('.')) {
                        actionId = await self.resolveXmlIdToActionId(actionIdAttr);
                    }
                    
                    if (actionId) {
                        console.log("🎯 Intercepting data-action-id button:", actionId);
                        await self.loadActionById(actionId);
                    }
                    return;
                }
            }
        };
        
        // Add listener to document to catch all stat button clicks
        document.addEventListener('click', this._statButtonClickHandler, true);
        
        // Also intercept mousedown for some edge cases
        this._statButtonMousedownHandler = (event) => {
            if (!self.embeddedState.isEmbeddedMode) return;
            
            // For stat buttons that use mousedown
            const statButton = event.target.closest('.oe_stat_button[type="action"]');
            if (statButton) {
                const buttonName = statButton.getAttribute('name');
                const actionId = self.extractActionId(buttonName);
                if (actionId) {
                    // Mark that we're handling this
                    statButton.dataset.spaIntercepted = 'true';
                }
            }
        };
        document.addEventListener('mousedown', this._statButtonMousedownHandler, true);
    }

    setupRouterInterception() {
        // Store original methods
        this._originalPushState = history.pushState.bind(history);
        this._originalReplaceState = history.replaceState.bind(history);
        
        const self = this;
        
        // Intercept pushState - prevent full page navigation when in embedded mode
        history.pushState = function(state, title, url) {
            if (self.embeddedState.isEmbeddedMode) {
                console.log("🚫 Blocking pushState in embedded mode:", url);
                // Don't navigate - just update URL silently
                if (url) {
                    self._originalReplaceState.call(history, state, title, url);
                }
                return;
            }
            return self._originalPushState.call(history, state, title, url);
        };
        
        // Also intercept replaceState
        const originalReplace = this._originalReplaceState;
        history.replaceState = function(state, title, url) {
            // Allow replace state but log it
            if (self.embeddedState.isEmbeddedMode && url) {
                console.log("📝 ReplaceState in embedded mode:", url);
            }
            return originalReplace.call(history, state, title, url);
        };
        
        // Handle popstate (back button)
        this._popstateHandler = (event) => {
            if (this.embeddedState.isEmbeddedMode) {
                event.preventDefault();
                event.stopPropagation();
                
                console.log("🔙 Back button pressed in embedded mode");
                
                // Handle back navigation within SPA
                if (this.actionStack.length > 0) {
                    this.goBackInActionStack();
                } else if (this.embeddedState.breadcrumbs.length > 1) {
                    this.goBackFromForm();
                } else {
                    this.closeEmbeddedView();
                }
            }
        };
        
        window.addEventListener('popstate', this._popstateHandler);
        
        // Also intercept link clicks that might escape our control
        this._linkClickHandler = (event) => {
            if (!self.embeddedState.isEmbeddedMode) return;
            
            const link = event.target.closest('a[href]');
            if (!link) return;
            
            const href = link.getAttribute('href');
            if (!href) return;
            
            // Check if this is an Odoo action link
            if (href.includes('/odoo/') || href.includes('/web#') || href.includes('action=')) {
                event.preventDefault();
                event.stopPropagation();
                console.log("🔗 Blocked link click, href:", href);
                
                // Try to extract action ID from URL
                const actionMatch = href.match(/action[=/-](\\d+)/);
                if (actionMatch) {
                    const actionId = parseInt(actionMatch[1], 10);
                    self.loadActionById(actionId);
                }
            }
        };
        document.addEventListener('click', this._linkClickHandler, true);
    }


    // ==================== PERSISTENT FRAME SETUP ====================

    setupPersistentFrame() {
        document.body.classList.add('zoho-dashboard-active');
        this.hideOdooNavbar();
    }

    injectActionContainerStyles() {
        const style = document.createElement('style');
        style.id = 'zoho-dashboard-styles';
        style.textContent = `
            /* Hide main navbar when dashboard is active */
            .zoho-dashboard-active .o_main_navbar {
                display: none !important;
            }
            
            /* Prevent body scroll when dashboard is active */
            .zoho-dashboard-active {
                overflow: hidden !important;
            }
        `;
        
        // Remove existing style if present
        const existing = document.getElementById('zoho-dashboard-styles');
        if (existing) existing.remove();
        
        document.head.appendChild(style);
    }

    /**
     * Create a sandboxed action service that reroutes actions to the embedded
     * renderer instead of replacing the whole webclient action stack.
     */
    getEmbeddedActionService() {
        if (this.embeddedActionService) {
            return this.embeddedActionService;
        }

        const self = this;
        const baseAction = this.actionService;

        this.embeddedActionService = {
            ...baseAction,
            async doAction(actionRequest, options = {}) {
                // Normalize xml_id / id / full action objects
                if (typeof actionRequest === "number" || typeof actionRequest === "string") {
                    return self.loadActionById(actionRequest);
                }

                if (actionRequest?.type === "ir.actions.client") {
                    const actionId = actionRequest.id || actionRequest.action_id || actionRequest.params?.action || null;
                    if (actionId) {
                        return self.loadClientAction(actionId);
                    }
                    if (actionRequest.tag) {
                        return self.loadClientActionByTag(actionRequest.tag, actionRequest);
                    }
                }

                if (actionRequest?.type === "ir.actions.act_window") {
                    // Render window actions with the embedded view pipeline
                    const viewModes = (actionRequest.view_mode || "list").split(",");
                    let viewType = (viewModes[0] || "list").trim();
                    if (viewType === "tree") viewType = "list";

                    self.embeddedState.currentResModel = actionRequest.res_model;
                    self.embeddedState.currentViewType = viewType;
                    self.embeddedState.currentDomain = actionRequest.domain || [];
                    self.embeddedState.currentContext = actionRequest.context || {};
                    self.embeddedState.currentResId = actionRequest.res_id || false;
                    self.embeddedState.viewTitle = actionRequest.name || self.embeddedState.viewTitle || "";
                    self.embeddedState.isEmbeddedMode = true;
                    self.embeddedState.isClientAction = false;
                    self.state.currentView = "embedded";

                    await self.loadAvailableViewTypes(actionRequest.res_model);
                    self.buildDynamicViewProps(
                        actionRequest.res_model,
                        viewType,
                        actionRequest.domain || [],
                        actionRequest.context || {},
                        actionRequest.res_id || false
                    );
                    return;
                }

                // Fallback to the default behavior (for dialogs, reports, etc.)
                return baseAction.doAction(actionRequest, options);
            },
        };

        return this.embeddedActionService;
    }

    /**
     * Dynamically discover and load required bundles for a view type or action.
     * This uses Odoo's asset registry to find what bundles are needed.
     */
    async loadViewBundles(resModel, viewType) {
        const bundlesToLoad = new Set();
        
        // Core view bundles
        const viewBundleMap = {
            'calendar': [
                'web.assets_backend_lazy',
                'web_calendar.calendar_assets',
                'calendar.assets_calendar',
                'calendar.assets_backend',
            ],
            'gantt': [
                'web_gantt.gantt_assets',
            ],
            'map': [
                'web_map.map_assets', 
            ],
            'pivot': [
                'web.assets_backend_lazy',
            ],
            'graph': [
                'web.assets_backend_lazy',
            ],
            'activity': [
                'mail.assets_messaging',
                'mail.assets_backend',
            ],
        };

        if (viewBundleMap[viewType]) {
            viewBundleMap[viewType].forEach(b => bundlesToLoad.add(b));
        }

        // Model-specific bundles
        const modelBundleMap = {
            'hr.leave': [
                'hr_holidays.assets_hr_holidays',
                'hr_holidays.assets_backend',
                'web_calendar.calendar_assets',
                'calendar.assets_calendar',
            ],
            'hr.leave.allocation': [
                'hr_holidays.assets_hr_holidays',
                'hr_holidays.assets_backend',
            ],
            'hr.employee': [
                'hr.assets_hr',
                'hr.assets_backend',
            ],
            'project.task': [
                'project.assets_project',
                'project.assets_backend',
            ],
            'project.project': [
                'project.assets_project',
                'project.assets_backend',
            ],
            'crm.lead': [
                'crm.assets_crm',
                'crm.assets_backend',
            ],
            'calendar.event': [
                'calendar.assets_calendar', 
                'web_calendar.calendar_assets',
                'calendar.assets_backend',
            ],
            'mail.message': [
                'mail.assets_messaging',
                'mail.assets_backend',
            ],
            'hr.contract': [
                'hr_contract.assets_hr_contract',
                'hr.assets_backend',
            ],
            'meeting': [
                'calendar.assets_calendar',
                'web_calendar.calendar_assets',
            ],
        };

        if (modelBundleMap[resModel]) {
            modelBundleMap[resModel].forEach(b => bundlesToLoad.add(b));
        }

        // Infer bundle from model name
        const modelParts = resModel.split('.');
        if (modelParts.length >= 1) {
            const moduleName = modelParts[0];
            bundlesToLoad.add(`${moduleName}.assets_backend`);
            // Also try to load module-specific assets
            if (moduleName === 'hr') {
                bundlesToLoad.add('hr.assets_hr');
            } else if (moduleName === 'calendar') {
                bundlesToLoad.add('calendar.assets_calendar');
            } else if (moduleName === 'crm') {
                bundlesToLoad.add('crm.assets_crm');
            }
        }

        await this.loadBundlesParallel(Array.from(bundlesToLoad));
    }

    /**
     * Load bundles for a client action tag.
     */
    async loadActionBundles(tag) {
        const bundlesToLoad = [];
        
        // For dashboard/spreadsheet, load Chart.js FIRST
        if (tag.includes('dashboard') || tag.includes('spreadsheet')) {
            bundlesToLoad.push('web.chartjs_lib');
        }
        
        // Known action tag to bundle mappings
        const actionBundleMap = {
            // Calendar
            'calendar': [
                'web.assets_backend_lazy',
                'web_calendar.calendar_assets', 
                'calendar.assets_calendar',
                'calendar.assets_backend',
            ],
            
            // Mail / Discuss
            'mail.action_discuss': ['mail.assets_messaging', 'mail.assets_discuss_public'],
            
            // Spreadsheet / Dashboards
            'action_spreadsheet_dashboard': [
                'spreadsheet.assets_spreadsheet_dashboard', 
                'spreadsheet.o_spreadsheet',
            ],
            'spreadsheet_dashboard': [
                'spreadsheet.assets_spreadsheet_dashboard',
            ],
            
            // Time Off
            'hr_holidays.hr_leave_action_my_request': ['hr_holidays.assets_hr_holidays'],
            'hr_holidays.action_hr_leave_dashboard': ['hr_holidays.assets_hr_holidays'],
            
            // Project
            'project.action_view_all_task': ['project.assets_project'],
            
            // CRM
            'crm.action_pipeline': ['crm.assets_crm'],
            
            // Knowledge
            'knowledge.action_home': ['knowledge.assets_knowledge'],
        };

        // Add known bundles
        if (actionBundleMap[tag]) {
            actionBundleMap[tag].forEach(b => {
                if (!bundlesToLoad.includes(b)) {
                    bundlesToLoad.push(b);
                }
            });
        }

        // Infer bundles from tag
        const tagParts = tag.split('.');
        if (tagParts.length >= 1) {
            const moduleName = tagParts[0];
            const inferredBundles = [
                `${moduleName}.assets_backend`,
                `${moduleName}.assets_${moduleName}`,
            ];
            inferredBundles.forEach(b => {
                if (!bundlesToLoad.includes(b)) {
                    bundlesToLoad.push(b);
                }
            });
        }

        // Load bundles sequentially for dependencies
        console.log(`📦 Loading ${bundlesToLoad.length} bundle(s):`, bundlesToLoad);
        
        for (const bundle of bundlesToLoad) {
            try {
                await loadBundle(bundle);
                console.log(`  ✓ Loaded: ${bundle}`);
            } catch (e) {
                console.log(`  → Skipped: ${bundle}`);
            }
        }
    }

    /**
     * Load multiple bundles in parallel with error handling.
     * Bundles that fail to load are silently skipped.
     */
    async loadBundlesParallel(bundles) {
        if (!bundles || bundles.length === 0) return;

        console.log(`📦 Loading ${bundles.length} bundle(s):`, bundles);

        const loadPromises = bundles.map(async (bundle) => {
            try {
                await loadBundle(bundle);
                console.log(`  ✓ Loaded: ${bundle}`);
                return { bundle, success: true };
            } catch (e) {
                // Bundle might not exist or already loaded - that's OK
                console.log(`  → Skipped: ${bundle} (${e.message || 'not found'})`);
                return { bundle, success: false };
            }
        });

        await Promise.all(loadPromises);
    }

    /**
     * Resolve a lazy-loaded component from the action registry.
     * First loads required bundles, then resolves the component.
     */
    async resolveLazyComponent(tag) {
        // Load bundles first
        await this.loadActionBundles(tag);
        
        // Also try to load module-specific backend assets
        const moduleName = tag.split('.')[0];
        if (moduleName && moduleName !== tag) {
            for (const bundleSuffix of ['assets_backend', 'assets_' + moduleName]) {
                try {
                    await loadBundle(`${moduleName}.${bundleSuffix}`);
                } catch (e) {
                    // Silently continue
                }
            }
        }

        const actionRegistry = registry.category("actions");
        let entry = actionRegistry.get(tag);
        
        // Try variations of the tag
        if (!entry) {
            const variations = [
                tag,
                tag.split('.').pop(),  // Just the action name
                tag.replace('.', '_'), // Underscore version
            ];
            
            for (const variation of variations) {
                entry = actionRegistry.get(variation);
                if (entry) break;
            }
        }
        
        if (!entry) {
            throw new Error(`Action "${tag}" not found in registry after loading bundles`);
        }

        // Resolve component (existing logic)
        let ComponentClass = null;

        if (typeof entry === 'function' && entry.prototype instanceof Component) {
            return entry;
        }

        if (typeof entry === 'function') {
            const result = await entry();
            ComponentClass = result?.default || result?.Component || result;
        } else if (entry.Component) {
            const comp = entry.Component;
            if (typeof comp === 'function' && comp.prototype instanceof Component) {
                ComponentClass = comp;
            } else if (typeof comp === 'function') {
                const result = await comp();
                ComponentClass = result?.default || result?.Component || result;
            }
        }

        if (!ComponentClass) {
            throw new Error(`Could not resolve component for "${tag}"`);
        }

        return ComponentClass;
    }

    /**
     * Mount a client action component inside our SPA container.
     * Sets the component in state so it renders within our component tree,
     * giving it access to all globally registered templates.
     */
    async doMountClientAction(clientAction) {
        console.log("🚀 Mounting client action in SPA:", clientAction.tag);

        try {
            // Step 1: Load all required bundles FIRST and wait for them
            console.log("📥 Step 1: Loading bundles for", clientAction.tag);
            await this.loadActionBundles(clientAction.tag);
            
            // CRITICAL: Give bundles time to fully initialize their components
            // Some bundles register components asynchronously
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Step 2: Resolve the component from registry
            console.log("📥 Step 2: Resolving component...");
            const ClientComponent = await this.resolveLazyComponent(clientAction.tag);
            console.log("✅ Component resolved:", ClientComponent.name || clientAction.tag);

            // Step 3: Verify component is valid
            if (!ClientComponent || typeof ClientComponent !== 'function') {
                throw new Error(`Invalid component for ${clientAction.tag}`);
            }

            // Step 4: Create action props - pass them directly, not nested
            const actionProps = {
                action: {
                    id: clientAction.id,
                    type: "ir.actions.client",
                    tag: clientAction.tag,
                    name: clientAction.name,
                    params: clientAction.params || {},
                    context: clientAction.context || {},
                    target: "current",
                },
                actionId: clientAction.id,
            };

            // Step 5: Set component in state
            console.log("🔧 Step 3: Setting component for rendering...");
            
            this.embeddedState.clientActionComponent = ClientComponent;
            this.embeddedState.clientActionProps = actionProps;
            this.embeddedState.clientActionMounted = true;
            
            // Use setTimeout to ensure OWL processes the state change
            setTimeout(() => {
                this.embeddedState.loading = false;
                console.log("✅ Client action ready");
            }, 0);

        } catch (error) {
            console.error("❌ Failed to mount client action:", error);
            this.embeddedState.errorMessage = `Failed to load ${clientAction.name || clientAction.tag}: ${error.message}`;
            this.embeddedState.clientActionComponent = null;
            this.embeddedState.clientActionProps = null;
            this.embeddedState.loading = false;
        }
    }

    cleanup() {
        try {
            // Remove stat button interceptors
            if (this._statButtonClickHandler) {
                document.removeEventListener('click', this._statButtonClickHandler, true);
                this._statButtonClickHandler = null;
            }
            if (this._statButtonMousedownHandler) {
                document.removeEventListener('mousedown', this._statButtonMousedownHandler, true);
                this._statButtonMousedownHandler = null;
            }
            // Remove link click handler
            if (this._linkClickHandler) {
                document.removeEventListener('click', this._linkClickHandler, true);
                this._linkClickHandler = null;
            }
            
            // Clear any pending timeouts
            if (this._calendarInitTimeout) {
                clearTimeout(this._calendarInitTimeout);
                this._calendarInitTimeout = null;
            }
            if (this._viewLoadingTimeout) {
                clearTimeout(this._viewLoadingTimeout);
                this._viewLoadingTimeout = null;
            }
            
            // Restore router
            if (this._originalPushState) {
                try {
                    history.pushState = this._originalPushState;
                } catch (e) {
                    console.warn("Could not restore pushState:", e);
                }
            }
            if (this._originalReplaceState) {
                try {
                    history.replaceState = this._originalReplaceState;
                } catch (e) {
                    console.warn("Could not restore replaceState:", e);
                }
            }
            if (this._popstateHandler) {
                try {
                    window.removeEventListener('popstate', this._popstateHandler);
                } catch (e) {
                    console.warn("Could not remove popstate handler:", e);
                }
            }
            
            // Restore action service
            if (this._originalDoAction) {
                try {
                    this.actionService.doAction = this._originalDoAction;
                } catch (e) {
                    console.warn("Could not restore doAction:", e);
                }
            }
            
            // Restore action service restore method
            if (this._originalRestore) {
                try {
                    this.actionService.restore = this._originalRestore;
                } catch (e) {
                    console.warn("Could not restore restore method:", e);
                }
            }
            
            // Cleanup client action
            this.cleanupClientAction();
            
            // Clear timers
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.clockInterval) clearInterval(this.clockInterval);
            if (this.announcementInterval) clearInterval(this.announcementInterval);
            
            // Clear chart instances
            if (this.leaveChartInstance) {
                try {
                    this.leaveChartInstance.destroy();
                } catch (e) {}
            }
            if (this.deptChartInstance) {
                try {
                    this.deptChartInstance.destroy();
                } catch (e) {}
            }
            
            document.body.classList.remove('zoho-dashboard-active');
            this.showOdooNavbar();
        } catch (e) {
            console.error("Error during cleanup:", e);
        }
    }

    hideOdooNavbar() {
        const navbar = document.querySelector('.o_main_navbar');
        if (navbar) navbar.style.display = 'none';
    }

    showOdooNavbar() {
        const navbar = document.querySelector('.o_main_navbar');
        if (navbar) navbar.style.display = '';
    }

    // ==================== CLIENT ACTION HANDLING ====================

    /**
     * Load and mount a client action inside the SPA container.
     * Resolves lazy-loaded components and creates a sub-application.
     */
    async loadClientAction(actionId) {
        console.log("🎬 Loading client action:", actionId);

        try {
            // Set loading state
            this.embeddedState.loading = true;
            this.embeddedState.errorMessage = null;
            this.embeddedState.isClientAction = true;
            this.embeddedState.clientActionMounted = false;
            this.embeddedState.isEmbeddedMode = true;
            this.state.currentView = "embedded";

            // Fetch action details
            const [clientAction] = await this.orm.call(
                "ir.actions.client",
                "read",
                [[actionId]],
                { fields: ["tag", "name", "params", "context", "target", "res_model"] }
            );

            if (!clientAction) {
                throw new Error("Client action not found");
            }

            this.embeddedState.viewTitle = clientAction.name || "Application";
            this.embeddedState.currentActionId = actionId;

            const actionData = {
                ...clientAction,
                context: this.parseContextSafe(clientAction.context) || {},
            };

            console.log("🚀 Mounting client action in SPA:", clientAction.tag);

            // Mount the client action in our container
            await this.doMountClientAction(actionData);

        } catch (error) {
            console.error("❌ Failed to load client action:", error);
            this.embeddedState.errorMessage = error.message || "Failed to load application";
            this.embeddedState.loading = false;
            this.notification.add(
                _t("Failed to load application: ") + (error.message || "Unknown error"),
                { type: "danger" }
            );
        }
    }

    async loadClientActionByTag(tag, originalAction = null) {
        const [clientAction] = await this.orm.searchRead(
            "ir.actions.client",
            [["tag", "=", tag]],
            ["id"],
            { limit: 1 }
        );

        if (!clientAction) {
            throw new Error(`Client action with tag "${tag}" not found`);
        }

        return this.loadClientAction(clientAction.id || originalAction?.id);
    }

    cleanupClientAction() {
        console.log("🧹 Cleaning up client action...");

        // Clear the dynamic component from state
        this.embeddedState.clientActionComponent = null;
        this.embeddedState.clientActionProps = null;
        this.embeddedState.isClientAction = false;
        this.embeddedState.clientActionMounted = false;
    }

    // ==================== DYNAMIC EMBEDDED VIEW SYSTEM ====================

    async loadEmbeddedView(resModel, title, domain = [], viewType = "list", context = {}) {
        // For calendar view, delegate entirely to loadCalendarViaAction (it manages its own state)
        if (viewType === "calendar") {
            return this.loadCalendarViaAction(resModel, title, domain, context);
        }

        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;
        this.embeddedState.isEmbeddedMode = true;
        this.embeddedState.isClientAction = false;
        this.embeddedState.viewTitle = title;
        this.embeddedState.currentResModel = resModel;
        this.embeddedState.currentResId = false;
        this.embeddedState.currentDomain = domain;
        this.embeddedState.currentViewType = viewType;
        this.embeddedState.currentContext = context;
        this.state.currentView = "embedded";
        
        // Clear action stack when starting fresh from sidebar
        this.actionStack = [];

        try {
            // Load required bundles
            await this.loadViewBundles(resModel, viewType);

            // Always load menus for the model - this gives us the proper app context and navigation
            const menuInfo = await this.loadMenusForModel(resModel);
            
            if (menuInfo.rootMenu) {
                // Set up app context with menus
                this.embeddedState.currentApp = {
                    id: menuInfo.rootMenu.id,
                    name: menuInfo.rootMenu.name
                };
                this.embeddedState.currentMenus = menuInfo.children || [];
                this.embeddedState.breadcrumbs = [
                    { id: menuInfo.rootMenu.id, name: menuInfo.rootMenu.name, type: 'app' },
                    { name: title, type: 'view' }
                ];
            } else {
                // Fallback when no menu found - simple title bar
                this.embeddedState.currentApp = { name: title };
                this.embeddedState.currentMenus = [];
                this.embeddedState.breadcrumbs = [{ name: title, type: 'model' }];
            }

            await this.loadAvailableViewTypes(resModel);

            if (!this.embeddedState.availableViewTypes.includes(viewType)) {
                viewType = this.embeddedState.availableViewTypes[0] || "list";
                this.embeddedState.currentViewType = viewType;
            }

            this.buildDynamicViewProps(resModel, viewType, domain, context);

        } catch (error) {
            console.error("Failed to load embedded view:", error);
            this.embeddedState.errorMessage = error.message || "Failed to load view";
            this.embeddedState.viewProps = null;
            this.embeddedState.loading = false;
        }
    }

    /**
     * Load embedded view with full menu structure
     * This is used for sidebar items to ensure proper app context and menus
     */
    async loadEmbeddedViewWithMenus(resModel, title, domain = [], viewType = "list", context = {}) {
        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;
        this.embeddedState.isEmbeddedMode = true;
        this.embeddedState.isClientAction = false;
        this.embeddedState.clientActionComponent = null;
        this.embeddedState.clientActionProps = null;
        this.embeddedState.viewTitle = title;
        this.embeddedState.currentResModel = resModel;
        this.embeddedState.currentResId = false;
        this.embeddedState.currentDomain = domain;
        this.embeddedState.currentViewType = viewType;
        this.embeddedState.currentContext = context;
        this.state.currentView = "embedded";

        try {
            // Load required bundles
            await this.loadViewBundles(resModel, viewType);

            // Find the action for this model to get full menu context
            let actionId = null;
            try {
                const actions = await this.orm.searchRead(
                    "ir.actions.act_window",
                    [["res_model", "=", resModel]],
                    ["id", "name", "domain", "context", "view_mode"],
                    { limit: 1, order: "id asc" }
                );
                
                if (actions && actions.length > 0) {
                    actionId = actions[0].id;
                    
                    // Merge action domain/context with provided ones
                    const actionDomain = this.parseDomainSafe(actions[0].domain);
                    const actionContext = this.parseContextSafe(actions[0].context);
                    
                    // User domain takes precedence
                    domain = [...actionDomain.filter(d => {
                        // Don't include duplicate employee_id domains
                        if (Array.isArray(d) && d[0] === 'employee_id') {
                            return !domain.some(ud => Array.isArray(ud) && ud[0] === 'employee_id');
                        }
                        return true;
                    }), ...domain];
                    
                    context = { ...actionContext, ...context };
                    
                    // Check if action has calendar in view_mode
                    const viewModes = (actions[0].view_mode || "list").split(",").map(v => v.trim());
                    if (viewModes[0] === "tree") viewModes[0] = "list";
                    
                    // Use the first available view type from action
                    if (viewModes.length > 0 && viewModes[0] !== viewType) {
                        // Keep the requested viewType unless it's not available
                    }
                    
                    this.embeddedState.currentActionId = actionId;
                }
            } catch (e) {
                console.warn("Could not find action for model:", e);
            }

            // Load menus for this model - this is the key difference from loadEmbeddedView
            const menuInfo = await this.loadMenusForModel(resModel);
            
            if (menuInfo && menuInfo.rootMenu) {
                this.embeddedState.currentApp = {
                    id: menuInfo.rootMenu.id,
                    name: menuInfo.rootMenu.name
                };
                this.embeddedState.currentMenus = menuInfo.children || [];
                this.embeddedState.breadcrumbs = [
                    { id: menuInfo.rootMenu.id, name: menuInfo.rootMenu.name, type: 'app' },
                    { name: title, type: 'view' }
                ];
            } else {
                // Fallback - try to find root menu by searching up the menu tree
                await this.loadMenusFromAction(actionId, title);
            }

            // Update domain and context
            this.embeddedState.currentDomain = domain;
            this.embeddedState.currentContext = context;

            // Load available view types
            await this.loadAvailableViewTypes(resModel);

            if (!this.embeddedState.availableViewTypes.includes(viewType)) {
                viewType = this.embeddedState.availableViewTypes[0] || "list";
                this.embeddedState.currentViewType = viewType;
            }

            // For calendar view, use specialized method
            if (viewType === "calendar") {
                await this.loadCalendarViaAction(resModel, title, domain, context);
            } else {
                this.buildDynamicViewProps(resModel, viewType, domain, context);
            }

        } catch (error) {
            console.error("Failed to load embedded view with menus:", error);
            this.embeddedState.errorMessage = error.message || "Failed to load view";
            this.embeddedState.viewProps = null;
            this.embeddedState.loading = false;
        }
    }

    /**
     * Load menus from an action ID by finding its menu and parent app
     */
    async loadMenusFromAction(actionId, fallbackTitle) {
        if (!actionId) {
            this.embeddedState.currentApp = { name: fallbackTitle };
            this.embeddedState.currentMenus = [];
            this.embeddedState.breadcrumbs = [{ name: fallbackTitle, type: 'model' }];
            return;
        }

        try {
            // Find menu that references this action
            const menus = await this.orm.searchRead(
                "ir.ui.menu",
                [["action", "=", `ir.actions.act_window,${actionId}`]],
                ["id", "name", "parent_id"],
                { limit: 1 }
            );

            if (menus && menus.length > 0) {
                let currentMenu = menus[0];
                let menuChain = [currentMenu];
                
                // Traverse up to find root menu
                while (currentMenu.parent_id) {
                    const parentMenus = await this.orm.searchRead(
                        "ir.ui.menu",
                        [["id", "=", currentMenu.parent_id[0]]],
                        ["id", "name", "parent_id"],
                        { limit: 1 }
                    );
                    
                    if (parentMenus && parentMenus.length > 0) {
                        currentMenu = parentMenus[0];
                        menuChain.unshift(currentMenu);
                    } else {
                        break;
                    }
                }

                // Root menu is the first in chain (no parent)
                const rootMenu = menuChain[0];
                
                // Get children of root menu
                const menuData = await this.orm.call(
                    "ir.ui.menu",
                    "get_menu_with_all_children",
                    [rootMenu.id]
                );

                this.embeddedState.currentApp = {
                    id: rootMenu.id,
                    name: rootMenu.name
                };
                this.embeddedState.currentMenus = menuData?.children || [];
                
                // Build breadcrumbs from menu chain
                this.embeddedState.breadcrumbs = [
                    { id: rootMenu.id, name: rootMenu.name, type: 'app' }
                ];
                
                // Add intermediate menus to breadcrumbs
                for (let i = 1; i < menuChain.length; i++) {
                    this.embeddedState.breadcrumbs.push({
                        id: menuChain[i].id,
                        name: menuChain[i].name,
                        type: 'menu'
                    });
                }
                
                // Update title to match the actual menu name
                if (menuChain.length > 1) {
                    this.embeddedState.viewTitle = menuChain[menuChain.length - 1].name;
                }
                
                return;
            }
        } catch (e) {
            console.warn("Could not load menus from action:", e);
        }

        // Fallback
        this.embeddedState.currentApp = { name: fallbackTitle };
        this.embeddedState.currentMenus = [];
        this.embeddedState.breadcrumbs = [{ name: fallbackTitle, type: 'model' }];
    }

        /**
         * Load calendar view via action - calendar requires action context
         * FIXED: Proper state management and loading sequence
         */
        async loadCalendarViaAction(resModel, title, domain = [], context = {}) {
            console.log("📅 Loading calendar view for:", resModel);
            
            // Step 1: Set loading state and clear previous view
            this.embeddedState.loading = true;
            this.embeddedState.viewProps = null;
            this.embeddedState.clientActionComponent = null;
            this.embeddedState.clientActionProps = null;
            this.embeddedState.isClientAction = false;
            this.embeddedState.clientActionMounted = false;
            this.embeddedState.errorMessage = null;
            
            // Step 2: Set embedded mode
            this.embeddedState.isEmbeddedMode = true;
            this.embeddedState.viewTitle = title;
            this.embeddedState.currentResModel = resModel;
            this.embeddedState.currentViewType = "calendar";
            this.embeddedState.currentDomain = domain;
            this.embeddedState.currentContext = context;
            this.embeddedState.currentResId = false;
            this.embeddedState.breadcrumbs = [{ name: title, type: 'model' }];
            this.state.currentView = "embedded";

            try {
                // Step 3: Load bundles with retry
                console.log("📦 Loading calendar bundles...");
                const calendarBundles = [
                    'web.assets_backend_lazy',
                    'web_calendar.calendar_assets',
                    'calendar.assets_calendar',
                    'calendar.assets_backend'
                ];
                
                for (const bundle of calendarBundles) {
                    try {
                        await loadBundle(bundle);
                        console.log(`  ✓ Loaded: ${bundle}`);
                    } catch (e) {
                        console.log(`  → Skipped: ${bundle}`);
                    }
                }
                
                // Wait for bundles to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Step 4: Find calendar action
                let actionId = null;
                let mergedDomain = [...domain];
                let mergedContext = { ...context };
                
                try {
                    const actions = await this.orm.searchRead(
                        "ir.actions.act_window",
                        [["res_model", "=", resModel], ["view_mode", "ilike", "calendar"]],
                        ["id", "name", "domain", "context"],
                        { limit: 1 }
                    );
                    if (actions && actions.length > 0) {
                        actionId = actions[0].id;
                        const actionDomain = this.parseDomainSafe(actions[0].domain);
                        const actionContext = this.parseContextSafe(actions[0].context);
                        mergedDomain = [...actionDomain, ...domain];
                        mergedContext = { ...actionContext, ...context };
                        console.log("✅ Found calendar action:", actionId);
                    }
                } catch (e) {
                    console.warn("Could not find calendar action:", e);
                }

                this.embeddedState.currentActionId = actionId;
                this.embeddedState.currentDomain = mergedDomain;
                this.embeddedState.currentContext = mergedContext;

                // Step 5: Load menus
                try {
                    const menuInfo = await this.loadMenusForModel(resModel);
                    if (menuInfo && menuInfo.rootMenu) {
                        this.embeddedState.currentApp = { id: menuInfo.rootMenu.id, name: menuInfo.rootMenu.name };
                        this.embeddedState.currentMenus = menuInfo.children || [];
                        this.embeddedState.breadcrumbs = [
                            { id: menuInfo.rootMenu.id, name: menuInfo.rootMenu.name, type: 'app' },
                            { name: title, type: 'view' }
                        ];
                    }
                } catch (e) {
                    console.warn("Could not load menus:", e);
                }

                await this.loadAvailableViewTypes(resModel);
                
                // Step 6: Build props
                const cleanDomain = this.cleanDomain(mergedDomain);
                const cleanContext = this.cleanContext(mergedContext);

                const viewProps = {
                    resModel: resModel,
                    type: "calendar",
                    domain: cleanDomain,
                    context: cleanContext,
                    display: {
                        controlPanel: {
                            "top-left": true,
                            "top-right": true,
                            "bottom-left": false,
                            "bottom-right": false,
                        },
                    },
                    loadIrFilters: true,
                    loadActionMenus: true,
                    searchViewId: false,
                    selectRecord: (resId, options) => this.handleSelectRecord(resModel, resId, options),
                    createRecord: () => this.handleCreateRecord(resModel),
                };

                if (actionId) {
                    viewProps.actionId = actionId;
                }

                // Step 7: Increment key first
                this.embeddedState.viewKey++;
                
                // Step 8: Set viewProps
                this.embeddedState.viewProps = viewProps;
                
                console.log("📅 Calendar props set:", { resModel, actionId, key: this.embeddedState.viewKey });
                
                // Step 9: Wait for render, then set loading=false
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            this.embeddedState.loading = false;
                            console.log("✅ Calendar view ready");
                            resolve();
                        });
                    });
                });
                
                // Step 10: Trigger resize for FullCalendar
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                    // Additional resize trigger for FullCalendar
                    const fcElements = document.querySelectorAll('.fc');
                    fcElements.forEach(fc => {
                        if (fc.__fullCalendar) {
                            fc.__fullCalendar.updateSize();
                        }
                    });
                }, 500);
                
                // Another resize after a longer delay
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                }, 1000);
                
            } catch (error) {
                console.error("❌ Failed to load calendar:", error);
                this.embeddedState.errorMessage = error.message || "Failed to load calendar";
                this.embeddedState.viewProps = null;
                this.embeddedState.loading = false;
            }
        }

        /**
         * Build calendar props - separated for clarity
         */
        _buildCalendarProps(resModel, domain, context, actionId) {
            const cleanDomain = this.cleanDomain(domain);
            const cleanContext = this.cleanContext(context);

            const props = {
                resModel: resModel,
                type: "calendar",
                domain: cleanDomain,
                context: cleanContext,
                display: {
                    controlPanel: {
                        "top-left": true,
                        "top-right": true,
                        "bottom-left": false,
                        "bottom-right": false,
                    },
                },
                loadIrFilters: true,
                loadActionMenus: true,
                searchViewId: false,
                selectRecord: (resId, options) => this.handleSelectRecord(resModel, resId, options),
                createRecord: () => this.handleCreateRecord(resModel),
            };

            if (actionId) {
                props.actionId = actionId;
            }

            return props;
        }

        /**
         * Build dynamic view props - FIXED loading sequence
         */
        buildDynamicViewProps(resModel, viewType, domain = [], context = {}, resId = false) {
            // For calendar, use specialized method
            if (viewType === "calendar") {
                this.loadCalendarViaAction(resModel, this.embeddedState.viewTitle || "Calendar", domain, context);
                return;
            }
            
            const cleanDomain = this.cleanDomain(domain);
            const cleanContext = this.cleanContext(context);
            const self = this;

            const props = {
                resModel: resModel,
                type: viewType,
                domain: cleanDomain,
                context: {
                    ...cleanContext,
                    form_view_initial_mode: resId ? 'readonly' : 'edit',
                },
                display: {
                    controlPanel: {
                        "top-left": true,
                        "top-right": true,
                        "bottom-left": true,
                        "bottom-right": true,
                    },
                },
                loadIrFilters: true,
                loadActionMenus: true,
                searchViewId: false,
                selectRecord: (id, opts) => this.handleSelectRecord(resModel, id, opts),
                createRecord: () => this.handleCreateRecord(resModel),
                // CRITICAL: Custom action handler to intercept stat button clicks
                onClickViewButton: async (params) => {
                    console.log("🔘 View button clicked:", params);
                    
                    // params contains: clickParams, getResParams, beforeExecute, afterExecute
                    const clickParams = params.clickParams || params;
                    
                    // If this is an action type button, intercept it
                    if (clickParams.type === 'action' && clickParams.name) {
                        let actionId = self.extractActionId(clickParams.name);
                        
                        // If XML ID, resolve it
                        if (!actionId && clickParams.name.includes('.')) {
                            actionId = await self.resolveXmlIdToActionId(clickParams.name);
                        }
                        
                        if (actionId) {
                            console.log("🎯 Intercepted view button action:", actionId);
                            await self.loadActionById(actionId);
                            return true; // Indicate we handled it
                        }
                    }
                    
                    // For object type buttons, we need to execute the method
                    // and handle any resulting action
                    if (clickParams.type === 'object' && clickParams.name) {
                        console.log("📝 Executing object method:", clickParams.name);
                        try {
                            const result = await self.orm.call(
                                resModel,
                                clickParams.name,
                                resId ? [[resId]] : [[]],
                                { context: cleanContext }
                            );
                            
                            // If the method returns an action, handle it in embedded mode
                            if (result && typeof result === 'object' && result.type) {
                                console.log("📊 Method returned action:", result.type);
                                await self.actionService.doAction(result);
                            }
                            return true;
                        } catch (e) {
                            console.error("Error executing method:", e);
                            return false;
                        }
                    }
                    
                    // Let other button types through
                    return false;
                },
            };

            if (this.embeddedState.currentActionId) {
                props.actionId = this.embeddedState.currentActionId;
            }

            if (viewType === "form") {
                if (resId) {
                    props.resId = resId;
                }
                props.loadIrFilters = false;
                props.searchViewId = undefined;
                props.preventEdit = false;
                props.preventCreate = false;
                
                // Better save/discard handlers
                props.onSave = async (record) => {
                    console.log("Form saved:", record);
                    this.notification.add(_t("Record saved"), { type: "success" });
                    // Optionally refresh or go back
                };
                
                props.onDiscard = () => {
                    console.log("Form discarded");
                    if (this.embeddedState.breadcrumbs.length > 1) {
                        this.goBackFromForm();
                    }
                };
            }

            // Set props
            this.embeddedState.errorMessage = null;
            this.embeddedState.viewProps = props;
            this.embeddedState.viewKey++;
            
            // Set loading to false after props are set
            setTimeout(() => {
                this.embeddedState.loading = false;
                console.log(`📊 View ready: ${viewType} for ${resModel}, key=${this.embeddedState.viewKey}`);
            }, 50);
        }

    cleanContext(context) {
        if (!context) return {};
        if (typeof context !== 'object' || Array.isArray(context)) return {};
        
        const cleanedContext = {};
        
        for (const [key, value] of Object.entries(context)) {
            if (value === undefined || value === null) continue;
            if (typeof value === 'string' && value.includes('uid')) continue;
            if (typeof value === 'string' && value.includes('active_id')) continue;
            
            if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
                cleanedContext[key] = value;
            } else if (Array.isArray(value)) {
                try {
                    cleanedContext[key] = value.filter(v => 
                        typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string'
                    );
                } catch (e) {
                    // Skip
                }
            }
        }
        
        return cleanedContext;
    }

    cleanDomain(domain) {
        if (!domain) return [];
        if (!Array.isArray(domain)) return [];
        
        try {
            return domain.filter(item => {
                if (Array.isArray(item) && item.length === 3) {
                    const [field, operator, value] = item;
                    if (typeof field !== 'string') return false;
                    if (typeof value === 'string' && (value.includes('uid') || value.includes('active_id'))) {
                        return false;
                    }
                    return true;
                }
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

    async handleSelectRecord(resModel, resId, options = {}) {
        if (!resModel || !resId) {
            console.warn("Invalid resModel or resId for handleSelectRecord");
            return;
        }
        
        let recordName = `#${resId}`;
        try {
            const records = await this.orm.read(resModel, [resId], ["display_name"]);
            if (records && records.length > 0 && records[0].display_name) {
                recordName = records[0].display_name;
            }
        } catch (e) {
            console.warn("Could not fetch record name:", e);
        }

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

        this.buildDynamicViewProps(resModel, "form", [], this.embeddedState.currentContext, resId);
    }

    handleCreateRecord(resModel) {
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

        const context = { ...this.embeddedState.currentContext };
        if (this.state.employee?.id) {
            const hrModels = ["hr.leave", "hr.attendance", "hr.payslip", "hr.expense", "hr.contract"];
            if (hrModels.includes(resModel)) {
                context.default_employee_id = this.state.employee.id;
            }
        }

        this.buildDynamicViewProps(resModel, "form", [], context, false);
    }

    async loadMenusForModel(resModel) {
        try {
            // Get all actions for this model (not just the first one)
            const actions = await this.orm.searchRead(
                "ir.actions.act_window",
                [["res_model", "=", resModel]],
                ["id", "name"],
                { limit: 20 }
            );

            // Try to find a menu linked to any of these actions
            for (const action of actions) {
                const actionId = action.id;
                const menus = await this.orm.searchRead(
                    "ir.ui.menu",
                    [["action", "=", `ir.actions.act_window,${actionId}`]],
                    ["id", "name", "parent_id"],
                    { limit: 1 }
                );

                if (menus.length > 0) {
                    let currentMenu = menus[0];
                    // Traverse up to find root menu
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

            // Fallback: Try to find menu by searching for model name in menu action
            // Some modules use different action references
            const allMenus = await this.orm.searchRead(
                "ir.ui.menu",
                [["action", "ilike", resModel]],
                ["id", "name", "parent_id", "action"],
                { limit: 5 }
            );

            if (allMenus.length > 0) {
                let currentMenu = allMenus[0];
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

            return { rootMenu: null, children: [] };
        } catch (error) {
            console.error("Failed to load menus for model:", error);
            return { rootMenu: null, children: [] };
        }
    }

    async loadAvailableViewTypes(resModel) {
        try {
            const views = await this.orm.searchRead(
                "ir.ui.view",
                [
                    ["model", "=", resModel],
                    ["type", "in", ["list", "tree", "kanban", "form", "calendar", "pivot", "graph", "activity"]]
                ],
                ["type"],
                { limit: 50 }
            );

            const typeSet = new Set();
            for (const view of views) {
                const type = view.type === "tree" ? "list" : view.type;
                typeSet.add(type);
            }

            let availableTypes = Array.from(typeSet);

            // Always ensure list and form are available
            if (!availableTypes.includes("list")) {
                availableTypes.unshift("list");
            }
            if (!availableTypes.includes("form")) {
                availableTypes.push("form");
            }

            // Reorder to prioritize common views
            const priorityOrder = ["list", "kanban", "calendar", "form", "graph", "pivot", "activity"];
            availableTypes.sort((a, b) => {
                const aIndex = priorityOrder.indexOf(a);
                const bIndex = priorityOrder.indexOf(b);
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });

            this.embeddedState.availableViewTypes = availableTypes;
        } catch (error) {
            console.error("Failed to load view types:", error);
            this.embeddedState.availableViewTypes = ["list", "form"];
        }
    }

    switchEmbeddedViewType(newType) {
        if (!this.embeddedState.currentResModel) return;
        if (this.embeddedState.currentViewType === newType) return;

        if (this.embeddedState.currentViewType === "form") {
            this.goBackFromForm();
            return;
        }

        this.embeddedState.currentViewType = newType;
        
        // Use calendar-specific loading for calendar view
        if (newType === "calendar") {
            this.loadCalendarViaAction(
                this.embeddedState.currentResModel,
                this.embeddedState.viewTitle,
                this.embeddedState.currentDomain,
                this.embeddedState.currentContext
            );
        } else {
            this.buildDynamicViewProps(
                this.embeddedState.currentResModel,
                newType,
                this.embeddedState.currentDomain,
                this.embeddedState.currentContext
            );
        }
    }

    goBackFromForm() {
        if (this.embeddedState.breadcrumbs.length > 1) {
            // Current behavior for within-action navigation
            const lastCrumb = this.embeddedState.breadcrumbs[this.embeddedState.breadcrumbs.length - 1];
            this.embeddedState.breadcrumbs = this.embeddedState.breadcrumbs.slice(0, -1);
            
            const previousType = lastCrumb.previousViewType || "list";
            this.embeddedState.currentViewType = previousType;
            this.embeddedState.currentResId = false;
            
            if (this.embeddedState.breadcrumbs.length > 0) {
                this.embeddedState.viewTitle = this.embeddedState.breadcrumbs[this.embeddedState.breadcrumbs.length - 1].name;
            }

            // Use calendar-specific loading if going back to calendar
            if (previousType === "calendar") {
                this.loadCalendarViaAction(
                    this.embeddedState.currentResModel,
                    this.embeddedState.viewTitle,
                    this.embeddedState.currentDomain,
                    this.embeddedState.currentContext
                );
            } else {
                this.buildDynamicViewProps(
                    this.embeddedState.currentResModel,
                    previousType,
                    this.embeddedState.currentDomain,
                    this.embeddedState.currentContext
                );
            }
        } else if (this.actionStack.length > 0) {
            // Go back to previous action
            this.goBackInActionStack();
        } else {
            this.closeEmbeddedView();
        }
    }

    refreshEmbeddedView() {
        if (!this.embeddedState.currentResModel) return;

        this.embeddedState.loading = true;
        this.embeddedState.viewProps = null;

        // Use appropriate method based on view type
        if (this.embeddedState.currentViewType === "calendar") {
            setTimeout(() => {
                this.loadCalendarViaAction(
                    this.embeddedState.currentResModel,
                    this.embeddedState.viewTitle,
                    this.embeddedState.currentDomain,
                    this.embeddedState.currentContext
                );
            }, 100);
        } else {
            setTimeout(() => {
                this.buildDynamicViewProps(
                    this.embeddedState.currentResModel,
                    this.embeddedState.currentViewType,
                    this.embeddedState.currentDomain,
                    this.embeddedState.currentContext,
                    this.embeddedState.currentResId
                );
            }, 100);
        }
    }

    // ==================== APP EMBEDDING ====================

    async loadEmbeddedApp(app) {
        if (!app) return;

        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;

        // Track that we came from Operations
        this.embeddedState.activeSidebarItem = "operations";

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

            if (!actionId && menuData?.children?.length) {
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
                // After loading action, check if resModel matches a sidebar item
                this.updateSidebarFromResModel();
            } else {
                this.embeddedState.errorMessage = _t("No action found for ") + app.name;
                // Default to operations if no match
                this.embeddedState.activeSidebarItem = "operations";
            }

        } catch (error) {
            console.error("Failed to open app:", error);
            this.embeddedState.errorMessage = _t("Failed to open ") + app.name;
            this.embeddedState.activeSidebarItem = "operations";
        } finally {
            this.embeddedState.loading = false;
        }
    }

    /**
     * Updates the active sidebar item based on the current resModel.
     * This helps highlight the correct sidebar item when opening modules from Operations.
     */
    updateSidebarFromResModel() {
        const resModel = this.embeddedState.currentResModel;
        
        if (!resModel) {
            this.embeddedState.activeSidebarItem = "operations";
            return;
        }
        
        // Map of res_models to sidebar item IDs
        const modelToSidebarMap = {
            "hr.leave": "leave",
            "hr.attendance": "attendance",
            "account.analytic.line": "timesheet",
            "hr.payslip": "payroll",
            "hr.expense": "expense",
        };
        
        const sidebarId = modelToSidebarMap[resModel];
        
        if (sidebarId) {
            this.embeddedState.activeSidebarItem = sidebarId;
        } else {
            // Default to operations for modules not in sidebar
            this.embeddedState.activeSidebarItem = "operations";
        }
    }

    async loadActionById(actionId) {
        try {
            const numericId = this.extractActionId(actionId);
            
            if (!numericId) {
                throw new Error("Invalid action ID");
            }

            console.log("🎬 Loading action by ID:", numericId);

            // CRITICAL: Ensure embedded mode is active
            if (!this.embeddedState.isEmbeddedMode) {
                this.embeddedState.isEmbeddedMode = true;
                this.state.currentView = "embedded";
            }

            // Save current state to stack before loading new action
            if ((this.embeddedState.currentResModel || this.embeddedState.isClientAction) && 
                this.embeddedState.currentActionId !== numericId) {
                this.actionStack.push({
                    resModel: this.embeddedState.currentResModel,
                    viewType: this.embeddedState.currentViewType,
                    domain: [...this.embeddedState.currentDomain],
                    context: {...this.embeddedState.currentContext},
                    resId: this.embeddedState.currentResId,
                    title: this.embeddedState.viewTitle,
                    breadcrumbs: [...this.embeddedState.breadcrumbs],
                    isClientAction: this.embeddedState.isClientAction,
                    actionId: this.embeddedState.currentActionId,
                });
            }

            // Set loading state
            this.embeddedState.loading = true;
            this.embeddedState.errorMessage = null;
            this.embeddedState.clientActionComponent = null;
            this.embeddedState.clientActionProps = null;

            // First, determine the action type
            const [actionInfo] = await this.orm.searchRead(
                "ir.actions.actions",
                [["id", "=", numericId]],
                ["type"],
                { limit: 1 }
            );

            if (!actionInfo) {
                throw new Error("Action not found");
            }

            const actionType = actionInfo.type;
            console.log("📌 Action type:", actionType);

            if (actionType === "ir.actions.act_window") {
                const actionData = await this.orm.call(
                    "ir.actions.act_window",
                    "read",
                    [[numericId]],
                    { fields: ["res_model", "view_mode", "domain", "context", "name", "views", "target", "res_id"] }
                );

                if (actionData && actionData.length) {
                    const action = actionData[0];
                    
                    // Check if it should open as dialog
                    if (action.target === "new") {
                        // Pop the saved state since we're not actually navigating
                        if (this.actionStack.length > 0) {
                            this.actionStack.pop();
                        }
                        this.embeddedState.loading = false;
                        return this._originalDoAction({
                            type: "ir.actions.act_window",
                            ...action
                        }, { target: "new" });
                    }

                    const viewModes = (action.view_mode || "list").split(",");
                    let viewType = viewModes[0].trim();
                    if (viewType === "tree") viewType = "list";

                    const domain = this.parseDomainSafe(action.domain);
                    const context = this.parseContextSafe(action.context);

                    this.embeddedState.currentResModel = action.res_model;
                    this.embeddedState.currentViewType = viewType;
                    this.embeddedState.currentDomain = domain;
                    this.embeddedState.currentContext = context;
                    this.embeddedState.currentResId = action.res_id || false;
                    this.embeddedState.currentActionId = numericId;
                    this.embeddedState.isClientAction = false;

                    if (action.name) {
                        this.embeddedState.viewTitle = action.name;
                        // Update breadcrumbs
                        const currentBreadcrumbs = [...this.embeddedState.breadcrumbs];
                        // Only add if it's different from the last breadcrumb
                        const lastCrumb = currentBreadcrumbs[currentBreadcrumbs.length - 1];
                        if (!lastCrumb || lastCrumb.name !== action.name) {
                            currentBreadcrumbs.push({
                                name: action.name,
                                type: 'action',
                                actionId: numericId,
                                resModel: action.res_model,
                                previousViewType: viewType
                            });
                            this.embeddedState.breadcrumbs = currentBreadcrumbs;
                        }
                    }

                    // Load bundles for the view type
                    await this.loadViewBundles(action.res_model, viewType);
                    
                    await this.loadAvailableViewTypes(action.res_model);

                    if (!this.embeddedState.availableViewTypes.includes(viewType)) {
                        viewType = this.embeddedState.availableViewTypes[0] || "list";
                        this.embeddedState.currentViewType = viewType;
                    }

                    // For calendar view, use special loading method
                    if (viewType === "calendar") {
                        await this.loadCalendarViaAction(action.res_model, action.name || "Calendar", domain, context);
                    } else {
                        // Build props - this will also set loading = false
                        this.buildDynamicViewProps(action.res_model, viewType, domain, context, action.res_id || false);
                    }
                }
            } else if (actionType === "ir.actions.client") {
                await this.loadClientAction(numericId);
            } else if (actionType === "ir.actions.act_url") {
                const [urlAction] = await this.orm.call(
                    "ir.actions.act_url",
                    "read",
                    [[numericId]],
                    { fields: ["url", "target"] }
                );
                if (urlAction) {
                    // Pop the saved state since we're not actually navigating in SPA
                    if (this.actionStack.length > 0) {
                        this.actionStack.pop();
                    }
                    this.embeddedState.loading = false;
                    
                    if (urlAction.target === "self") {
                        window.location.href = urlAction.url;
                    } else {
                        window.open(urlAction.url, "_blank");
                        this.notification.add(_t("Link opened in new tab"), { type: "info" });
                    }
                }
            } else if (actionType === "ir.actions.server") {
                await this.executeServerAction(numericId);
            } else if (actionType === "ir.actions.report") {
                // Pop the saved state
                if (this.actionStack.length > 0) {
                    this.actionStack.pop();
                }
                this.embeddedState.loading = false;
                await this.executeReportAction(numericId);
            } else {
                this.embeddedState.errorMessage = `Action type "${actionType}" is not supported in embedded mode.`;
                this.embeddedState.currentActionId = numericId;
                this.embeddedState.loading = false;
            }

        } catch (error) {
            console.error("Failed to load action:", error);
            this.embeddedState.errorMessage = error.message || "Failed to load action";
            this.embeddedState.loading = false;
        }
    }



    // Add method to go back in action stack
    goBackInActionStack() {
        if (this.actionStack.length === 0) {
            console.log("📚 Action stack empty, closing embedded view");
            this.closeEmbeddedView();
            return;
        }

        const previousState = this.actionStack.pop();
        console.log("📚 Popping from action stack, remaining:", this.actionStack.length);

        // Restore state
        this.embeddedState.currentResModel = previousState.resModel;
        this.embeddedState.currentViewType = previousState.viewType;
        this.embeddedState.currentDomain = previousState.domain;
        this.embeddedState.currentContext = previousState.context;
        this.embeddedState.currentResId = previousState.resId;
        this.embeddedState.viewTitle = previousState.title;
        this.embeddedState.breadcrumbs = previousState.breadcrumbs;
        this.embeddedState.isClientAction = previousState.isClientAction;
        this.embeddedState.currentActionId = previousState.actionId;

        // Rebuild the view
        if (previousState.isClientAction && previousState.actionId) {
            this.loadClientAction(previousState.actionId);
        } else if (previousState.resModel) {
            if (previousState.viewType === "calendar") {
                this.loadCalendarViaAction(
                    previousState.resModel,
                    previousState.title,
                    previousState.domain,
                    previousState.context
                );
            } else {
                this.buildDynamicViewProps(
                    previousState.resModel,
                    previousState.viewType,
                    previousState.domain,
                    previousState.context,
                    previousState.resId
                );
            }
        } else {
            this.closeEmbeddedView();
        }
    }

    async executeServerAction(actionId) {
        try {
            const result = await this.orm.call(
                "ir.actions.server",
                "run",
                [[actionId]],
                { context: this.embeddedState.currentContext }
            );

            if (result && typeof result === 'object' && result.type) {
                if (result.type === 'ir.actions.act_window') {
                    const viewModes = (result.view_mode || "list").split(",");
                    let viewType = viewModes[0].trim();
                    if (viewType === "tree") viewType = "list";

                    this.embeddedState.currentResModel = result.res_model;
                    this.embeddedState.currentViewType = viewType;
                    this.embeddedState.currentDomain = result.domain || [];
                    this.embeddedState.currentContext = result.context || {};
                    this.embeddedState.currentResId = result.res_id || false;

                    if (result.name) {
                        this.embeddedState.viewTitle = result.name;
                    }

                    await this.loadAvailableViewTypes(result.res_model);
                    this.buildDynamicViewProps(result.res_model, viewType, result.domain || [], result.context || {}, result.res_id || false);
                } else if (result.type === 'ir.actions.client') {
                    await this.loadClientAction(result.id || actionId);
                }
            } else {
                this.notification.add(_t("Action completed"), { type: "success" });
            }
        } catch (error) {
            console.error("Failed to execute server action:", error);
            this.notification.add(_t("Failed to execute action"), { type: "danger" });
        }
    }

    async executeReportAction(actionId) {
        try {
            const [reportAction] = await this.orm.call(
                "ir.actions.report",
                "read",
                [[actionId]],
                { fields: ["report_type", "report_name", "name"] }
            );

            if (reportAction) {
                const reportUrl = `/report/${reportAction.report_type}/${reportAction.report_name}`;
                                window.open(reportUrl, "_blank");
                this.notification.add(_t("Report opened in new tab"), { type: "info" });
            }
        } catch (error) {
            console.error("Failed to execute report action:", error);
            this.notification.add(_t("Failed to open report"), { type: "danger" });
        }
    }

    parseDomainSafe(domainValue) {
        if (!domainValue) return [];
        if (Array.isArray(domainValue)) {
            return this.cleanDomain(domainValue);
        }
        return [];
    }

    parseContextSafe(contextValue) {
        if (!contextValue) return {};
        if (typeof contextValue === 'object' && !Array.isArray(contextValue)) {
            return this.cleanContext(contextValue);
        }
        return {};
    }

    /**
     * Handle actions triggered from form view buttons (smart buttons, stat buttons)
     * This intercepts button clicks before they escape to the main action manager
     */
    setupFormButtonInterception() {
        // This is handled by patchActionService, but we need to ensure
        // the action service patch is comprehensive enough
    }

    /**
     * Extract action ID from various formats
     * Handles: numbers, numeric strings, xml_ids (module.action_name), and action_xxx formats
     */
    extractActionId(actionId) {
        if (typeof actionId === 'number') {
            return actionId;
        }
        if (typeof actionId === 'string') {
            // Handle pure numeric string
            const parsed = parseInt(actionId, 10);
            if (!isNaN(parsed) && parsed.toString() === actionId) {
                return parsed;
            }
            
            // Handle "123" format (numeric in quotes)
            const numericMatch = actionId.match(/^(\d+)$/);
            if (numericMatch) {
                return parseInt(numericMatch[1], 10);
            }
            
            // Handle action_xxx format (extract number at end)
            const actionMatch = actionId.match(/action_?(\d+)$/i);
            if (actionMatch) {
                return parseInt(actionMatch[1], 10);
            }
            
            // Handle trailing number after underscore (e.g., "some_action_123")
            const trailingMatch = actionId.match(/_(\d+)$/);
            if (trailingMatch) {
                return parseInt(trailingMatch[1], 10);
            }
            
            // For XML IDs like "module.action_name", return null
            // The caller should resolve these separately via ORM
            if (actionId.includes('.')) {
                // This is likely an XML ID, return null and let caller handle
                return null;
            }
        }
        return null;
    }

    /**
     * Resolve an XML ID to a numeric action ID
     * Handles both "module.name" and "name" formats
     */
    async resolveXmlIdToActionId(xmlId) {
        if (!xmlId) return null;
        
        try {
            // Split into module and name
            const parts = xmlId.split('.');
            let module = '';
            let name = xmlId;
            
            if (parts.length >= 2) {
                module = parts[0];
                name = parts.slice(1).join('.');
            }
            
            // Search for the external ID
            const domain = module 
                ? [["module", "=", module], ["name", "=", name]]
                : [["name", "=", name]];
            
            const result = await this.orm.searchRead(
                "ir.model.data",
                domain,
                ["res_id", "model"],
                { limit: 1 }
            );
            
            if (result && result.length > 0) {
                console.log("✅ Resolved XML ID:", xmlId, "->", result[0].res_id);
                return result[0].res_id;
            }
            
            console.warn("⚠️ XML ID not found:", xmlId);
        } catch (e) {
            console.error("Could not resolve XML ID:", xmlId, e);
        }
        return null;
    }

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

    closeEmbeddedView() {
        console.log("Closing embedded view...");
        // Clear action stack
        this.actionStack = [];
        // Restore main action visibility
        const mainActionManager = document.querySelector('.o_action_manager');
        if (mainActionManager) {
            const activeAction = mainActionManager.querySelector('.o_action');
            if (activeAction) {
                activeAction.style.display = '';
                activeAction.style.visibility = '';
                activeAction.style.position = '';
                activeAction.style.pointerEvents = '';
            }
        }

        // Clean up container
        this.cleanupClientAction();

        // Reset all states
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
        this.embeddedState.currentActionId = null;
        this.embeddedState.isClientAction = false;
        this.embeddedState.clientActionMounted = false;
        this.embeddedState.activeSidebarItem = "home"; // Reset to home

        this.state.currentView = "home";
        this.state.activeMainTab = "myspace";

        setTimeout(() => this.renderCharts(), 300);
    }

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
            
            if (viewType === "calendar") {
                this.loadCalendarViaAction(
                    this.embeddedState.currentResModel,
                    crumb.name,
                    this.embeddedState.currentDomain,
                    this.embeddedState.currentContext
                );
            } else {
                this.buildDynamicViewProps(
                    this.embeddedState.currentResModel,
                    viewType,
                    this.embeddedState.currentDomain,
                    this.embeddedState.currentContext
                );
            }
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
                type: a.holiday_status_id ? a.holiday_status_id[1] : 'Unknown',
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
        try {
            return this.state.currentTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (e) {
            return '--:--';
        }
    }

    get formattedCurrentDate() {
        try {
            return this.state.currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch (e) {
            return '';
        }
    }

    get currentAnnouncement() {
        if (!this.state.announcements.length) return null;
        return this.state.announcements[this.state.currentAnnouncementIndex];
    }

    // ==================== DATA LOADING ====================

    async loadChartLibrary() {
        try {
            // First, try to load Odoo's bundled Chart.js
            try {
                await loadBundle('web.chartjs_lib');
                console.log("✓ Loaded web.chartjs_lib bundle");
            } catch (e) {
                // Bundle might not exist, continue
            }
            
            // Check if Chart is now available
            if (typeof Chart === "undefined" && typeof window.Chart === "undefined") {
                // Load from CDN as fallback
                await loadJS("https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js");
                console.log("✓ Loaded Chart.js from CDN");
            }
            
            // Ensure Chart is globally available
            if (typeof Chart !== "undefined") {
                window.Chart = Chart;
            } else if (typeof window.Chart !== "undefined") {
                // Already available
            } else {
                console.warn("Chart.js could not be loaded");
                this.state.chartLoaded = false;
                return;
            }
            
            this.state.chartLoaded = true;
            console.log("✓ Chart.js ready globally");
        } catch (error) {
            console.error("Failed to load Chart.js:", error);
            this.state.chartLoaded = false;
        }
    }

    async loadInitialData() {
        try {
            try {
                this.state.isManager = await this.orm.call("hr.employee", "check_user_group", []);
            } catch (e) {
                console.warn("Failed to check user group:", e);
                this.state.isManager = false;
            }

            try {
                const empDetails = await this.orm.call("hr.employee", "get_user_employee_details", []);
                if (empDetails && empDetails[0] && empDetails[0].name) {
                    this.state.employee = empDetails[0];
                    this.state.attendance = empDetails[0].attendance_lines || [];
                    this.state.leaves = empDetails[0].leave_lines || [];
                    this.state.expenses = empDetails[0].expense_lines || [];
                } else {
                    // Set default employee object to prevent template errors
                    this.state.employee = {
                        id: false,
                        name: 'User',
                        attendance_state: 'checked_out',
                        job_id: false,
                        department_id: false,
                        work_email: '',
                        mobile_phone: '',
                        payslip_count: 0,
                        emp_timesheets: 0,
                        contracts_count: 0,
                        broad_factor: 0,
                        leaves_to_approve: 0,
                        leaves_today: 0,
                        leaves_this_month: 0,
                        leaves_alloc_req: 0,
                        job_applications: 0,
                    };
                }
            } catch (e) {
                console.error("Failed to load employee details:", e);
                // Set default employee object
                this.state.employee = {
                    id: false,
                    name: 'User',
                    attendance_state: 'checked_out',
                };
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

            if (this.state.isManager && !this.contentTabs.find(t => t.id === 'manager')) {
                this.contentTabs.push({ id: "manager", label: "Manager View" });
            }

            await this.loadApps();
        } catch (error) {
            console.error("Failed to load initial data:", error);
            // Ensure employee is always defined
            if (!this.state.employee) {
                this.state.employee = { name: 'User', attendance_state: 'checked_out' };
            }
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
        if (!this.state.chartLoaded || typeof Chart === "undefined") return;
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
        // Clear any previous active state first
        this.embeddedState.activeSidebarItem = null;
        
        if (item.action === "home") {
            this.closeEmbeddedView();
            this.state.currentView = "home";
            this.state.activeTab = "activities";
            this.state.activeMainTab = "myspace";
            this.embeddedState.activeSidebarItem = "home";
            setTimeout(() => this.renderCharts(), 300);
        } else if (item.action === "operations") {
            if (this.embeddedState.isEmbeddedMode) {
                this.closeEmbeddedView();
            }
            this.state.currentView = "operations";
            this.embeddedState.activeSidebarItem = "operations";
        } else if (item.action === "profile") {
            if (this.embeddedState.isEmbeddedMode) {
                this.closeEmbeddedView();
            }
            this.state.currentView = "profile";
            this.embeddedState.activeSidebarItem = "profile";
        } else if (item.actionXmlId) {
            // Load via action XML ID (e.g., Leave dashboard)
            this.embeddedState.activeSidebarItem = item.id;
            this.loadSidebarActionByXmlId(item);
        } else if (item.model) {
            // Set active sidebar item for model-based items
            this.embeddedState.activeSidebarItem = item.id;
            this.openSidebarModel(item);
        }
    }

    /**
     * Load a sidebar item by its action XML ID
     * This ensures we get the proper dashboard view with all components
     */
    async loadSidebarActionByXmlId(item) {
        this.embeddedState.loading = true;
        this.embeddedState.errorMessage = null;
        this.embeddedState.isEmbeddedMode = true;
        this.embeddedState.isClientAction = false;
        this.embeddedState.viewTitle = item.title || item.label;
        this.state.currentView = "embedded";
        
        // Clear action stack when starting fresh from sidebar
        this.actionStack = [];
        
        try {
            // Resolve XML ID to numeric action ID
            const actionId = await this.resolveXmlIdToActionId(item.actionXmlId);
            
            if (actionId) {
                console.log("📅 Loading sidebar action:", item.actionXmlId, "->", actionId);
                await this.loadActionById(actionId);
            } else {
                // Fallback to model-based view if action not found
                console.warn("Could not resolve action XML ID:", item.actionXmlId);
                if (item.model) {
                    this.loadEmbeddedView(item.model, item.title || item.label);
                } else {
                    this.embeddedState.errorMessage = "Action not found: " + item.actionXmlId;
                    this.embeddedState.loading = false;
                }
            }
        } catch (error) {
            console.error("Failed to load sidebar action:", error);
            this.embeddedState.errorMessage = error.message || "Failed to load";
            this.embeddedState.loading = false;
        }
    }

    openSidebarModel(item) {
        // Clear previous embedded state
        this.embeddedState.currentMenus = [];
        this.embeddedState.currentApp = null;
        this.embeddedState.breadcrumbs = [];
        
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

    async onAppClick(app) {
        if (!app) return;

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
        if (!this.state.employee?.id) {
            this.notification.add(_t("No employee record found"), { type: "warning" });
            return;
        }

        if (this.state.employee.attendance_state === 'checked_out' || !this.state.employee.attendance_state) {
            this.state.employee.attendance_state = 'checked_in';
        } else {
            this.state.employee.attendance_state = 'checked_out';
        }

        await this.updateAttendance();
    }

    async updateAttendance() {
        try {
            const result = await this.orm.call(
                'hr.employee',
                'attendance_manual',
                [[this.state.employee.id]]
            );

            if (result !== false) {
                const attendanceState = this.state.employee.attendance_state;
                let message = '';

                if (attendanceState === 'checked_in') {
                    message = 'Checked In';
                    this.state.timerRunning = true;
                    this.state.timerSeconds = 0;
                    this.startTimer();
                } else if (attendanceState === 'checked_out') {
                    message = 'Checked Out';
                    this.state.timerRunning = false;
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                        this.timerInterval = null;
                    }
                }

                this.notification.add(_t("Successfully " + message), { type: "success" });
                await this.refreshEmployeeData();
            }
        } catch (error) {
            console.error("Check in/out error:", error);
            await this.refreshEmployeeData();

            let errorMsg = _t("Check in/out failed");
            if (error.data?.message) {
                errorMsg += ": " + error.data.message;
            } else if (error.message) {
                errorMsg += ": " + error.message;
            }

            this.notification.add(errorMsg, { type: "danger" });
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

                if (this.state.employee.attendance_state === "checked_in") {
                    if (!this.state.timerRunning) {
                        this.state.timerRunning = true;
                        await this.initializeTimer();
                    }
                } else {
                    this.state.timerRunning = false;
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                        this.timerInterval = null;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to refresh employee data:", e);
        }
    }

    async initializeTimer() {
        if (this.state.employee?.attendance_state === "checked_in") {
            this.state.timerRunning = true;

            try {
                const openAttendance = await this.orm.searchRead(
                    "hr.attendance",
                    [
                        ["employee_id", "=", this.state.employee.id],
                        ["check_out", "=", false]
                    ],
                    ["check_in"],
                    { limit: 1, order: "check_in desc" }
                );

                if (openAttendance.length > 0) {
                    const checkInStr = openAttendance[0].check_in;
                    const checkIn = new Date(checkInStr.replace(' ', 'T') + 'Z');
                    const now = new Date();
                    const diffSeconds = Math.floor((now - checkIn) / 1000);
                    this.state.timerSeconds = Math.max(0, diffSeconds);
                } else {
                    this.state.timerSeconds = 0;
                }
            } catch (e) {
                console.error("Failed to get check-in time:", e);
                this.state.timerSeconds = 0;
            }

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

    // ==================== QUICK ACTIONS ====================

    async onQuickAdd() {
        await this.addLeave();
    }

    async addAttendance() {
        if (!this.state.employee?.id) {
            this.notification.add(_t("No employee record found"), { type: "warning" });
            return;
        }

        try {
            await this.actionService.doAction({
                type: "ir.actions.act_window",
                name: _t("New Attendance"),
                res_model: "hr.attendance",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_employee_id: this.state.employee.id,
                },
            });
        } catch (error) {
            console.error("Failed to open attendance form:", error);
            this.notification.add(_t("Failed to open form"), { type: "warning" });
        }
    }

    async addLeave() {
        if (!this.state.employee?.id) {
            this.notification.add(_t("No employee record found"), { type: "warning" });
            return;
        }

        try {
            await this.actionService.doAction({
                type: "ir.actions.act_window",
                name: _t("New Time Off"),
                res_model: "hr.leave",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_employee_id: this.state.employee.id,
                },
            });
        } catch (error) {
            console.error("Failed to open leave form:", error);
            this.notification.add(_t("Failed to open form"), { type: "warning" });
        }
    }

    async addExpense() {
        if (!this.state.employee?.id) {
            this.notification.add(_t("No employee record found"), { type: "warning" });
            return;
        }

        try {
            await this.actionService.doAction({
                type: "ir.actions.act_window",
                name: _t("New Expense"),
                res_model: "hr.expense",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_employee_id: this.state.employee.id,
                },
            });
        } catch (error) {
            console.error("Failed to open expense form:", error);
            this.notification.add(_t("Failed to open form"), { type: "warning" });
        }
    }

    async addProject() {
        try {
            await this.actionService.doAction({
                type: "ir.actions.act_window",
                name: _t("New Task"),
                res_model: "project.task",
                views: [[false, "form"]],
                target: "new",
                context: {},
            });
        } catch (error) {
            console.error("Failed to open task form:", error);
            this.notification.add(_t("Failed to open form"), { type: "warning" });
        }
    }

    toggleFab() {
        this.embeddedState.fabOpen = !this.embeddedState.fabOpen;
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
                type: "ir.actions.act_window",
                name: _t("My Profile"),
                res_model: "hr.employee",
                res_id: this.state.employee.id,
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
            type: "ir.actions.act_window",
            name: member.name,
            res_model: "hr.employee",
            res_id: member.id,
            views: [[false, "form"]],
            target: "new",
        });
    }

    // ==================== ROW CLICKS ====================

    async onAttendanceRowClick(att) {
        await this.actionService.doAction({
            type: "ir.actions.act_window",
            name: _t("Attendance"),
            res_model: "hr.attendance",
            res_id: att.id,
            views: [[false, "form"]],
            target: "new",
        });
    }

    async onLeaveRowClick(leave) {
        await this.actionService.doAction({
            type: "ir.actions.act_window",
            name: _t("Leave Request"),
            res_model: "hr.leave",
            res_id: leave.id,
            views: [[false, "form"]],
            target: "new",
        });
    }

    async onExpenseRowClick(exp) {
        await this.actionService.doAction({
            type: "ir.actions.act_window",
            name: _t("Expense"),
            res_model: "hr.expense",
            res_id: exp.id,
            views: [[false, "form"]],
            target: "new",
        });
    }

    async onProjectRowClick(proj) {
        await this.actionService.doAction({
            type: "ir.actions.act_window",
            name: _t("Task"),
            res_model: "project.task",
            res_id: proj.id,
            views: [[false, "form"]],
            target: "new",
        });
    }
}

registry.category("actions").add("hr_dashboard_spa", ZohoDashboard);