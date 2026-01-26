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
            currentViews: [],  // Store views from action [viewId, viewType] pairs
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
            tasks: [],
            birthdays: [],
            events: [],
            announcements: [],
            documents_count: 0,
            announcements_count: 0,
            apps: [],
            searchQuery: "",
            timerSeconds: 0,
            timerRunning: false,
            leaveChartData: [],
            attendanceChartData: [], // NEW
            deptChartData: [],
            chartLoaded: false,
            leaveBalances: [],
            teamMembers: [],
            skills: [],
            ongoingActivities: {
                todo: 0,
                call: 0,
                meeting: 0,
                email: 0,
                followup: 0,
            },
            leaveBalancePopupOpen: false,
            leaveBalanceSummary: {
                total_allocated: 0,
                total_taken: 0,
                total_remaining: 0,
                num_leave_types: 0,
            },
            currentAnnouncementIndex: 0,
            currentTime: new Date(),
            // New quick stats
            task_count: 0,
            working_hours: 0,
            // User menu state
            userMenuOpen: false,
            activitiesPanelOpen: false,
            messagesPanelOpen: false,
            messagesTab: "all",
            activitiesSummary: [],
            messagesList: [],
            activityCount: 0,
            messageCount: 0,
            companies: [],
            currentCompany: null,
            currentUserId: false,
            // Popup states
            personalInfoPopupOpen: false,
            attendanceTrendPopupOpen: false,
            leaveTrendPopupOpen: false,
            skillsPopupOpen: false,
            // Manager Employee Applications count (EAMS)
            managerEmployeeApplicationsCount: 0,
        });

        // Load count for manager Employee Applications (EAMS)
        this.loadManagerEmployeeApplicationsCount = async () => {
            try {
                // Count only applications in 'submitted' state
                const employeeId = this.state.employee?.id;
                const domain = [["state", "=", "submitted"]];
                if (employeeId) {
                    domain.push(["employee_id", "=", employeeId]);
                }
                const count = await this.orm.call(
                    "eams.employee.application",
                    "search_count",
                    domain
                );
                this.state.managerEmployeeApplicationsCount = count;
            } catch (e) {
                this.state.managerEmployeeApplicationsCount = 0;
            }
        };

        // Handler to open all Employee Applications (EAMS) for manager
        this.openManagerEmployeeApplications = () => {
            this.loadEmbeddedView(
                "eams.employee.application",
                "Employee Applications",
                [["state", "=", "submitted"]],
                "list"
            );
        };
        this.addEmployeeApplication = async () => {
            await this.actionService.doAction({
                type: "ir.actions.act_window",
                name: _t("Employee Application"),
                res_model: "eams.employee.application",
                view_mode: "form",
                views: [[false, "form"]],
                target: "new",
                context: {
                    default_employee_id: this.state.employee?.id || false,
                },
            });
        };
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
            currentViews: [],  // Store views from action [viewId, viewType] pairs
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
            tasks: [],
            birthdays: [],
            events: [],
            announcements: [],
            documents_count: 0,
            announcements_count: 0,
            apps: [],
            searchQuery: "",
            timerSeconds: 0,
            timerRunning: false,
            leaveChartData: [],
            attendanceChartData: [], // NEW
            deptChartData: [],
            chartLoaded: false,
            leaveBalances: [],
            teamMembers: [],
            skills: [],
            ongoingActivities: {
                todo: 0,
                call: 0,
                meeting: 0,
                email: 0,
                followup: 0,
            },
            leaveBalancePopupOpen: false,
            leaveBalanceSummary: {
                total_allocated: 0,
                total_taken: 0,
                total_remaining: 0,
                num_leave_types: 0,
            },
            currentAnnouncementIndex: 0,
            currentTime: new Date(),
            // New quick stats
            task_count: 0,
            working_hours: 0,
            // User menu state
            userMenuOpen: false,
            activitiesPanelOpen: false,
            messagesPanelOpen: false,
            messagesTab: "all",
            activitiesSummary: [],
            messagesList: [],
            activityCount: 0,
            messageCount: 0,
            companies: [],
            currentCompany: null,
            currentUserId: false,
            // Popup states
            personalInfoPopupOpen: false,
            attendanceTrendPopupOpen: false,
            leaveTrendPopupOpen: false,
            skillsPopupOpen: false,
        });
        

        // Navigation items - some use action IDs for proper dashboard loading
        this.sidebarItems = [
            { id: "home", icon: "🏠", label: "Home", action: "home" },
            { id: "profile", icon: "👤", label: "Profile", action: "profile" },
            { id: "appraisal", icon: "📈", label: "Appraisals", model: "hr.appraisal", title: "My Appraisals" },
            { id: "leave", icon: "📅", label: "Leave", model: "hr.leave", title: "Time Off" },
            { id: "attendance", icon: "⏰", label: "Attendance", model: "hr.attendance", title: "My Attendance" },
            { id: "timesheet", icon: "⏱️", label: "Timesheets", model: "timesheet.report", title: "Time Log Summary" },
            { id: "payroll", icon: "💰", label: "Payroll", model: "hr.payslip", title: "My Payslips" },
            // { id: "expense", icon: "💳", label: "Expenses", model: "hr.expense", title: "My Expenses" },
            // Task Management items with proper action references
            // { id: "my_tasks", icon: "📝", label: "My Tasks", model: "task.management", title: "My Tasks", actionKey: "my_tasks", actionXmlId: "task_management.action_my_tasks" },
            // { id: "team_tasks", icon: "👥", label: "Team Tasks", model: "task.management", title: "Team Tasks", actionKey: "team_tasks", actionXmlId: "task_management.action_team_tasks" },
            { id: "operations", icon: "⚙️", label: "Operations", action: "operations" },
        ];

        this.contentTabs = [
            { id: "activities", label: "Activities" },
            { id: "attendance", label: "Attendance" },
            { id: "leaves", label: "Leaves" },
            { id: "expenses", label: "Expenses" },
            // { id: "appraisals", label: "Appraisals" },
            { id: "employee_applications", label: "Employee Application" },
            { id: "tasks", label: "Task Management" },
            // { id: "projects", label: "Projects" },
            { id: "notifications", label: "Notifications" },
        ];
        // Handler to open EAMS Employee Application view
        // Fetch a summary of the current user's applications for the tab
        this.loadEmployeeApplicationsSummary = async () => {
            const userId = this.state.employee?.user_id?.[0] || this.state.employee?.user_id;
            if (!userId) {
                this.state.employeeApplicationsSummary = [];
                return;
            }
            try {
                const apps = await this.orm.searchRead(
                    "eams.employee.application",
                    [["user_id", "=", userId]],
                    ["id", "application_number", "application_type_id", "state", "request_date", "subject"],
                    { limit: 5, order: "create_date desc" }
                );
                this.state.employeeApplicationsSummary = apps;
            } catch (e) {
                this.state.employeeApplicationsSummary = [];
            }
        };

        // Handler to open EAMS Employee Application view (full app)
        // Consistent with other tabs: use employee_id for domain, use loadEmbeddedView for 'View All'
        this.openAllEmployeeApplications = () => {
            this.loadEmbeddedView(
                "eams.employee.application",
                "Employee Applications",
                this.state.employee?.id ? [["employee_id", "=", this.state.employee.id]] : [],
                "list"
            );
        };

        // Handler to open a single application record in embedded mode
        // Consistent with other tabs: use doAction for popup
        this.onEmployeeApplicationRowClick = async (app) => {
            if (!app || !app.id) return;
            await this.actionService.doAction({
                type: "ir.actions.act_window",
                name: _t("Employee Application"),
                res_model: "eams.employee.application",
                res_id: app.id,
                views: [[false, "form"]],
                target: "new",
            });
        };

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
            await this.loadUserMenuData();
            // After employee/user state is loaded, load the EAMS count
            await this.loadManagerEmployeeApplicationsCount();
            // Fallback: if count is still 0, try again after 2 seconds
            setTimeout(() => {
                if (!this.state.managerEmployeeApplicationsCount) {
                    this.loadManagerEmployeeApplicationsCount();
                }
            }, 2000);
        });

        onMounted(() => {
            this.initializeTimer();
            this.startClockTimer();
            this.startAnnouncementSlider();
            this.setupPersistentFrame();
            this.setupStatButtonInterceptor();
            this.setupClickOutsideHandler();
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

    openLeaveBalancePopup() {
        this.state.leaveBalancePopupOpen = true;
    }

    closeLeaveBalancePopup() {
        this.state.leaveBalancePopupOpen = false;
    }

    async viewAllLeaveAllocations() {
        this.closeLeaveBalancePopup();
        if (!this.state.employee?.id) return;
        
        // Open leave allocations view filtered by employee
        this.embeddedState.activeSidebarItem = "leave";
        await this.loadEmbeddedView("hr.leave.allocation", "My Leave Allocations", [
            ["employee_id", "=", this.state.employee.id],
            ["state", "=", "validate"]
        ], "list");
    }

    /**
     * Filter and normalize view types to only supported ones
     * @param {Array} viewModes - Array of view mode strings
     * @param {Array} availableViews - Array of [viewId, viewType] pairs from action
     * @returns {Object} - {viewType: string, availableTypes: Array}
     */
    filterSupportedViewTypes(viewModes, availableViews = []) {
        const supportedViewTypes = ["list", "kanban", "form", "calendar", "pivot", "graph", "activity"];
        const unsupportedTypes = ["hierarchy", "tree"]; // tree will be normalized to list
        
        // Normalize and filter view modes
        let normalizedModes = viewModes
            .map(v => v === "tree" ? "list" : v)
            .filter(v => supportedViewTypes.includes(v) && !unsupportedTypes.includes(v));
        
        // Get available types from views array
        let availableTypes = availableViews
            .map(v => v[1] === "tree" ? "list" : v[1])
            .filter(v => supportedViewTypes.includes(v) && !unsupportedTypes.includes(v));
        
        // If no available types, use normalized modes
        if (availableTypes.length === 0) {
            availableTypes = normalizedModes.length > 0 ? normalizedModes : ["list"];
        }
        
        // Select the best view type
        let viewType = normalizedModes.find(v => availableTypes.includes(v));
        
        if (!viewType) {
            // Fallback priority
            if (availableTypes.includes("list")) viewType = "list";
            else if (availableTypes.includes("kanban")) viewType = "kanban";
            else if (availableTypes.includes("form")) viewType = "form";
            else viewType = availableTypes[0] || "list";
        }
        
        return {
            viewType: viewType,
            availableTypes: availableTypes
        };
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
                        console.log("🔢 Loading action by ID in embedded mode:", numericId);
                        // Prevent full page navigation - load in embedded mode
                        return await self.loadActionById(numericId);
                    }
                    // If it's an XML ID string, try to resolve it
                    if (typeof actionRequest === "string" && actionRequest.includes('.')) {
                        const resolvedId = await self.resolveXmlIdToActionId(actionRequest);
                        if (resolvedId) {
                            console.log("🔢 Resolved XML ID to action:", actionRequest, "->", resolvedId);
                            return await self.loadActionById(resolvedId);
                        }
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
                    console.log("🔢 Opening dialog (target=new)");
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

        // AGGRESSIVE FILTERING: Remove banned view types
        const supportedViewTypes = ["list", "kanban", "form", "calendar", "pivot", "graph", "activity"];
        const bannedViewTypes = ["hierarchy", "qweb", "search"];
        
        // Clean view_mode string
        let viewModeString = actionRequest.view_mode || "list";
        bannedViewTypes.forEach(banned => {
            const regex = new RegExp(`\\b${banned}\\b,?`, 'gi');
            viewModeString = viewModeString.replace(regex, '');
        });
        viewModeString = viewModeString.replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
        if (!viewModeString) viewModeString = "list";
        
        let viewModes = viewModeString.split(",").map(v => v.trim()).filter(v => v);
        
        // Normalize and filter
        viewModes = viewModes
            .map(v => v === "tree" ? "list" : v)
            .filter(v => supportedViewTypes.includes(v) && !bannedViewTypes.includes(v));
        
        if (viewModes.length === 0) {
            viewModes = ["list"];
        }
        
        let viewType = viewModes[0];

        // Clean action.views array
        let availableViewTypes = [];
        if (actionRequest.views && Array.isArray(actionRequest.views)) {
            const cleanedViews = actionRequest.views.filter(v => {
                const vType = v[1] === "tree" ? "list" : v[1];
                return supportedViewTypes.includes(vType) && !bannedViewTypes.includes(vType);
            });
            availableViewTypes = cleanedViews
                .map(v => v[1] === "tree" ? "list" : v[1])
                .filter(v => supportedViewTypes.includes(v));
        }
        
        if (availableViewTypes.length === 0) {
            availableViewTypes = viewModes;
        }
        
        // Ensure viewType is safe
        if (!availableViewTypes.includes(viewType) || bannedViewTypes.includes(viewType)) {
            if (availableViewTypes.includes("list")) {
                viewType = "list";
            } else if (availableViewTypes.includes("kanban")) {
                viewType = "kanban";
            } else if (availableViewTypes.includes("form")) {
                viewType = "form";
            } else if (availableViewTypes.length > 0) {
                viewType = availableViewTypes[0];
            } else {
                viewType = "list";
            }
        }
        
        // Final safety check
        if (bannedViewTypes.includes(viewType)) {
            viewType = "list";
        }

        // Determine if we have a specific record
        let resId = actionRequest.res_id || false;
        
        // If views include form and we have res_id, prioritize form view
        if (resId && availableViewTypes.includes("form")) {
            viewType = "form";
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
                views: [...(this.embeddedState.currentViews || [])],
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

        // Final validation: ensure viewType is available
        if (!this.embeddedState.availableViewTypes.includes(viewType)) {
            // Fallback logic
            if (this.embeddedState.availableViewTypes.includes("list")) {
                viewType = "list";
            } else if (this.embeddedState.availableViewTypes.includes("kanban")) {
                viewType = "kanban";
            } else if (this.embeddedState.availableViewTypes.includes("form")) {
                viewType = "form";
            } else if (this.embeddedState.availableViewTypes.length > 0) {
                viewType = this.embeddedState.availableViewTypes[0];
            } else {
                // Last resort: use native Odoo action
                console.warn("⚠️ No suitable view type found, falling back to native action");
                this.embeddedState.loading = false;
                return this._originalDoAction(actionRequest, options);
            }
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
                views: [...(this.embeddedState.currentViews || [])],
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
        
        // Track the last kanban record that had a dropdown toggle clicked
        // This helps us find the record context when dropdown items are in a Portal
        this._lastKanbanRecordContext = null;
        
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
                    el.classList.contains('o_dropdown_toggler_btn') ||
                    el.classList.contains('o_kanban_manage_toggle_button') ||
                    el.classList.contains('fa-ellipsis-v') ||
                    el.classList.contains('fa-ellipsis-h')
                )) return true;
                if (el.hasAttribute && (
                    el.hasAttribute('data-bs-toggle') ||
                    el.hasAttribute('data-toggle') ||
                    el.hasAttribute('aria-expanded')
                )) return true;
                // Check for button with vertical dots icon
                if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'I') {
                    const icon = el.querySelector('.fa-ellipsis-v, .fa-ellipsis-h, .oi-three-dots-vertical');
                    if (icon) return true;
                }
                if (el.textContent && el.textContent.trim().toLowerCase() === 'more' && 
                    !el.classList.contains('dropdown-item')) return true;
                return false;
            };
            
            // Check if we're clicking on a dropdown toggle - cache the kanban record context
            let currentEl = target;
            while (currentEl && currentEl !== document) {
                if (isDropdownToggle(currentEl)) {
                    console.log("📋 Allowing dropdown toggle interaction");
                    // Cache the kanban record context before the dropdown opens
                    // Look for kanban record in ancestors
                    const kanbanRecord = currentEl.closest('.o_kanban_record') || 
                                        currentEl.closest('[data-id]') ||
                                        currentEl.closest('article');
                    if (kanbanRecord) {
                        self._lastKanbanRecordContext = {
                            element: kanbanRecord,
                            resId: self.extractRecordIdFromElement(kanbanRecord),
                            resModel: self.extractModelFromElement(kanbanRecord) || self.embeddedState.currentResModel
                        };
                        console.log("📌 Cached kanban record context:", self._lastKanbanRecordContext);
                    }
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
                            console.debug("Could not find dropdown action:", e);
                        }
                    }
                }
                
                if (buttonType === 'object' && buttonName) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    // Pass the dropdown item element to extract record context
                    await self.executeObjectMethodAndHandleResult(buttonName, dropdownItem);
                    return;
                }
                
                // Handle dropdown items without explicit type (common in Odoo 18)
                // These often call methods like button_immediate_install, button_immediate_upgrade, etc.
                if (buttonName && !buttonType) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    console.log("📋 Dropdown item without type, trying as object method:", buttonName);
                    await self.executeObjectMethodAndHandleResult(buttonName, dropdownItem);
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
                        console.debug("Could not resolve action (trying fallback):", buttonName);
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
                            console.debug("Could not find action by name:", e);
                        }
                    }
                }
                
                // If it's an object type button (server method), intercept and handle
                if (buttonType === 'object' && buttonName) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    console.log("🔧 Executing object method:", buttonName);
                    await self.executeObjectMethodAndHandleResult(buttonName, statButton);
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
                            console.debug("Could not find stat button action:", e);
                        }
                    }
                    
                    // Try as an object method (Python method call)
                    if (!actionId) {
                        await self.executeObjectMethodAndHandleResult(buttonName, statButton);
                        return;
                    }
                    
                    if (actionId) {
                        console.log("🎯 Found action for button:", actionId);
                        await self.loadActionById(actionId);
                        return;
                    }
                    
                    console.debug("Could not resolve button action:", buttonName);
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

    /**
     * Extract record ID from a DOM element (for kanban/list records)
     * This looks for data attributes or parent containers that hold the record ID
     */
    extractRecordIdFromElement(element) {
        if (!element) return null;
        
        let current = element;
        while (current && current !== document) {
            // Check common Odoo record ID patterns
            // Odoo 18 uses data-id on kanban records
            if (current.dataset && current.dataset.id) {
                const id = parseInt(current.dataset.id, 10);
                if (!isNaN(id)) {
                    console.log("📌 Found record ID via dataset.id:", id);
                    return id;
                }
            }
            
            // Check for o_kanban_record class (contains __owl__ with record data)
            if (current.classList && current.classList.contains('o_kanban_record')) {
                // Try multiple paths to get the record ID from OWL component
                if (current.__owl__) {
                    const owl = current.__owl__;
                    
                    // Path 1: component.props.record.resId
                    if (owl.component?.props?.record?.resId) {
                        console.log("📌 Found record ID via owl.component.props.record.resId:", owl.component.props.record.resId);
                        return owl.component.props.record.resId;
                    }
                    
                    // Path 2: component.record.resId
                    if (owl.component?.record?.resId) {
                        console.log("📌 Found record ID via owl.component.record.resId:", owl.component.record.resId);
                        return owl.component.record.resId;
                    }
                    
                    // Path 3: component.props.id
                    if (owl.component?.props?.id) {
                        const id = parseInt(owl.component.props.id, 10);
                        if (!isNaN(id)) {
                            console.log("📌 Found record ID via owl.component.props.id:", id);
                            return id;
                        }
                    }
                    
                    // Path 4: bdom data (Odoo 18 specific)
                    if (owl.bdom) {
                        // Look through bdom for record data
                        const findRecordId = (obj, depth = 0) => {
                            if (depth > 5 || !obj) return null;
                            if (obj.resId) return obj.resId;
                            if (obj.id && typeof obj.id === 'number') return obj.id;
                            if (obj.props?.record?.resId) return obj.props.record.resId;
                            if (obj.component?.props?.record?.resId) return obj.component.props.record.resId;
                            return null;
                        };
                        const bdId = findRecordId(owl.bdom);
                        if (bdId) {
                            console.log("📌 Found record ID via bdom:", bdId);
                            return bdId;
                        }
                    }
                }
                
                // Also try to find it in the element's text content (module name -> search)
                // This is a fallback for the Apps kanban where ID might not be directly accessible
            }
            
            // Check for data-res-id attribute
            if (current.hasAttribute && current.hasAttribute('data-res-id')) {
                const id = parseInt(current.getAttribute('data-res-id'), 10);
                if (!isNaN(id)) {
                    console.log("📌 Found record ID via data-res-id:", id);
                    return id;
                }
            }
            
            // Check for list row data-id
            if (current.tagName === 'TR' && current.dataset && current.dataset.id) {
                const id = parseInt(current.dataset.id, 10);
                if (!isNaN(id)) {
                    console.log("📌 Found record ID via TR dataset.id:", id);
                    return id;
                }
            }
            
            // Check for article element with data-id (Odoo 18 kanban)
            if (current.tagName === 'ARTICLE' && current.dataset && current.dataset.id) {
                const id = parseInt(current.dataset.id, 10);
                if (!isNaN(id)) {
                    console.log("📌 Found record ID via ARTICLE dataset.id:", id);
                    return id;
                }
            }
            
            current = current.parentElement;
        }
        
        // Not finding a record ID here is often expected (e.g., dropdown in Portal)
        // We have fallback methods, so this is just debug info
        console.debug("Could not extract record ID from element - will use fallback");
        return null;
    }

    /**
     * Extract the model from a DOM element context
     */
    extractModelFromElement(element) {
        if (!element) return null;
        
        let current = element;
        while (current && current !== document) {
            // Check for o_kanban_record with component data
            if (current.classList && current.classList.contains('o_kanban_record')) {
                if (current.__owl__) {
                    const owl = current.__owl__;
                    
                    // Path 1: component.props.record.resModel
                    if (owl.component?.props?.record?.resModel) {
                        return owl.component.props.record.resModel;
                    }
                    
                    // Path 2: component.record.resModel
                    if (owl.component?.record?.resModel) {
                        return owl.component.record.resModel;
                    }
                    
                    // Path 3: component.props.resModel
                    if (owl.component?.props?.resModel) {
                        return owl.component.props.resModel;
                    }
                }
            }
            
            // Check for data-res-model attribute
            if (current.hasAttribute && current.hasAttribute('data-res-model')) {
                return current.getAttribute('data-res-model');
            }
            
            current = current.parentElement;
        }
        return null;
    }

    /**
     * Execute an object method on a record and handle any returned action
     * @param {string} methodName - The name of the method to execute
     * @param {HTMLElement} sourceElement - Optional source element to extract record context from
     */
    async executeObjectMethodAndHandleResult(methodName, sourceElement = null) {
        try {
            // Try to get record context from the source element first (for kanban/list items)
            let resModel = sourceElement ? this.extractModelFromElement(sourceElement) : null;
            let resId = sourceElement ? this.extractRecordIdFromElement(sourceElement) : null;
            
            // Fallback to cached kanban record context (for dropdown items in Portals)
            if (!resId && this._lastKanbanRecordContext) {
                console.log("📌 Using cached kanban record context");
                if (!resModel) resModel = this._lastKanbanRecordContext.resModel;
                if (!resId) resId = this._lastKanbanRecordContext.resId;
            }
            
            // Fallback to current embedded state
            if (!resModel) resModel = this.embeddedState.currentResModel;
            if (!resId) resId = this.embeddedState.currentResId;
            
            // Special fallback for ir.module.module (Apps kanban) - find by technical name
            if (resModel === 'ir.module.module' && !resId) {
                // Try using cached element or source element
                const elementToSearch = this._lastKanbanRecordContext?.element || sourceElement;
                if (elementToSearch) {
                    resId = await this.findModuleIdFromElement(elementToSearch);
                }
            }
            
            if (resModel && resId) {
                console.log("🔧 Executing object method:", methodName, "on", resModel, resId);
                const result = await this.orm.call(
                    resModel,
                    methodName,
                    [[resId]],
                    { context: this.embeddedState.currentContext || {} }
                );
                
                console.log("📊 Method returned:", result);
                
                // If the method returns an action, handle it explicitly in embedded mode
                if (result && typeof result === 'object' && result.type) {
                    console.log("📊 Method returned action:", result.type, result);
                    
                    // Handle window actions directly
                    if (result.type === 'ir.actions.act_window') {
                        await this.handleWindowActionInEmbedded(result);
                        return;
                    }
                    
                    // Handle client actions
                    if (result.type === 'ir.actions.client') {
                        if (result.id) {
                            await this.loadClientAction(result.id);
                        } else if (result.tag) {
                            await this.loadClientActionByTag(result.tag, result);
                        }
                        return;
                    }
                    
                    // For URL actions (like "Learn More")
                    if (result.type === 'ir.actions.act_url') {
                        if (result.url) {
                            if (result.target === 'self') {
                                window.location.href = result.url;
                            } else {
                                window.open(result.url, '_blank');
                            }
                        }
                        return;
                    }
                    
                    // For other action types, use the original doAction to bypass our interceptor
                    await this._originalDoAction(result);
                } else if (result === true || result === false || result === undefined) {
                    // Method completed without returning an action - refresh the view
                    console.log("📊 Method completed, refreshing view...");
                    // Reload the current action to refresh the view
                    if (this.embeddedState.currentActionId) {
                        await this.loadActionById(this.embeddedState.currentActionId);
                    }
                }
            } else {
                console.debug("No resModel or resId available for object method execution. Model:", resModel, "ID:", resId);
                this.notification.add(
                    _t("Unable to execute action: No record selected"),
                    { type: "warning" }
                );
            }
        } catch (e) {
            console.error("Error executing method:", e);
            this.notification.add(
                _t("Error: ") + (e.message || e.data?.message || "Failed to execute action"),
                { type: "danger" }
            );
        }
    }
    
    /**
     * Find module ID from element by looking for the technical name in the kanban card
     * This is a fallback for Apps kanban when __owl__ doesn't expose the record ID
     */
    async findModuleIdFromElement(element) {
        if (!element) return null;
        
        // Find the kanban card container
        const kanbanCard = element.closest('.o_kanban_record') || element.closest('article') || element;
        if (!kanbanCard) return null;
        
        console.log("🔍 Searching for module technical name in:", kanbanCard.outerHTML?.substring(0, 500));
        
        let technicalName = null;
        
        // Method 1: Look for data attribute
        if (kanbanCard.dataset && kanbanCard.dataset.name) {
            technicalName = kanbanCard.dataset.name;
            console.log("📌 Found via dataset.name:", technicalName);
        }
        
        // Method 2: Look for specific class that contains module name in Odoo Apps
        // The technical name is usually displayed in a smaller font below the module name
        if (!technicalName) {
            // Look for elements with specific styling that typically contain technical names
            const candidates = kanbanCard.querySelectorAll(
                '.text-muted, .o_text_overflow, small, .text-info, .badge, ' + 
                '.oe_module_name, .oe_module_desc, [data-module-name]'
            );
            
            for (const el of candidates) {
                let text = el.getAttribute('data-module-name') || 
                          el.getAttribute('title') || 
                          el.textContent?.trim();
                
                // Module technical names are lowercase with underscores, no spaces
                if (text && /^[a-z][a-z0-9_]*$/.test(text) && text.length > 2 && text.length < 50) {
                    technicalName = text;
                    console.log("📌 Found via candidate element:", technicalName);
                    break;
                }
            }
        }
        
        // Method 3: Try to find in all text nodes
        if (!technicalName) {
            const allText = kanbanCard.querySelectorAll('span, div, small, a');
            for (const el of allText) {
                const text = el.textContent?.trim();
                // Module technical names are lowercase with underscores
                if (text && /^[a-z][a-z0-9_]*$/.test(text) && text.length > 2 && text.length < 50) {
                    // Avoid common false positives
                    const falsePositives = ['module', 'upgrade', 'install', 'activate', 'learn', 'more', 'info'];
                    if (!falsePositives.includes(text.toLowerCase())) {
                        technicalName = text;
                        console.log("📌 Found via text content:", technicalName);
                        break;
                    }
                }
            }
        }
        
        if (!technicalName) {
            console.debug("Could not find module technical name in kanban card");
            return null;
        }
        
        console.log("🔍 Looking up module by technical name:", technicalName);
        
        try {
            const modules = await this.orm.searchRead(
                'ir.module.module',
                [['name', '=', technicalName]],
                ['id'],
                { limit: 1 }
            );
            
            if (modules && modules.length > 0) {
                console.log("📌 Found module ID:", modules[0].id);
                return modules[0].id;
            }
        } catch (e) {
            console.error("Error looking up module:", e);
        }
        
        return null;
    }

        /**
     * Dynamically find an action for a given model
     * Used when navigating to external modules like task_management
     */
    async findActionForModel(resModel, preferredActionName = null) {
        try {
            let domain = [["res_model", "=", resModel]];
            
            // If we have a preferred action name, search for it first
            if (preferredActionName) {
                const preferredAction = await this.orm.searchRead(
                    "ir.actions.act_window",
                    [
                        ["res_model", "=", resModel],
                        "|",
                        ["name", "ilike", preferredActionName],
                        ["xml_id", "ilike", preferredActionName]
                    ],
                    ["id", "name", "xml_id", "view_mode", "domain", "context"],
                    { limit: 1 }
                );
                
                if (preferredAction && preferredAction.length) {
                    console.log("✅ Found preferred action:", preferredAction[0]);
                    return preferredAction[0];
                }
            }
            
            // Fallback: find the first action for this model
            const actions = await this.orm.searchRead(
                "ir.actions.act_window",
                domain,
                ["id", "name", "xml_id", "view_mode", "domain", "context"],
                { limit: 5, order: "id asc" }
            );
            
            if (actions && actions.length) {
                // Prefer actions that are linked to menus
                for (const action of actions) {
                    const menu = await this.orm.searchRead(
                        "ir.ui.menu",
                        [["action", "=", `ir.actions.act_window,${action.id}`]],
                        ["id"],
                        { limit: 1 }
                    );
                    if (menu && menu.length) {
                        console.log("✅ Found action with menu:", action);
                        return action;
                    }
                }
                // If no action has a menu, return the first one
                console.log("✅ Found action (no menu):", actions[0]);
                return actions[0];
            }
            
            return null;
        } catch (e) {
            console.error("Error finding action for model:", e);
            return null;
        }
    }

    /**
     * Try to resolve known module action XML IDs
     * This maps common module patterns to their XML IDs
     */
    getKnownModuleActions() {
        return {
            // HR Holidays / Time Off - Dashboard with year calendar and stats cards
            'hr.leave': {
                'default': 'hr_holidays.hr_leave_action_new_request',   // Dashboard with time_off_calendar_dashboard js_class
                'my_request': 'hr_holidays.hr_leave_action_my',         // My Time Off list view
                'dashboard': 'hr_holidays.hr_leave_action_new_request',
                'overview': 'hr_holidays.action_hr_holidays_dashboard', // Overview (hr.leave.report.calendar)
                'all': 'hr_holidays.hr_leave_action_action_approve_department',
            },
            'hr.leave.report.calendar': {
                'default': 'hr_holidays.action_hr_holidays_dashboard',
            },
            'hr.leave.allocation': {
                'default': 'hr_holidays.hr_leave_allocation_action_my',
                'approve': 'hr_holidays.hr_leave_allocation_action_approve_department',
            },
            // Task Management
            'task.management': {
                'my_tasks': 'task_management.action_my_tasks',
                'team_tasks': 'task_management.action_team_tasks',
                'all_tasks': 'task_management.action_all_tasks',
            },
            'task.team': {
                'default': 'task_management.action_task_teams',
            },
            // Appraisal
            'hr.appraisal': {
                'default': 'oh_appraisal.open_view_hr_appraisal_tree',
            },
            'oh.appraisal.master': {
                'default': 'oh_appraisal_ext.oh_app_ext_action_master_form',
            },
            // Announcements
            'hr.announcement': {
                'default': 'hr_reward_warning.action_hr_announcement',
            },
        };
    }

    /**
     * Resolve an action by searching various criteria
     * Handles models like task.management, hr.announcement, etc.
     */
    async resolveActionByNameOrModel(actionName, resModel = null) {
        console.log("🔍 Resolving action by name/model:", actionName, resModel);
        
        try {
            // Build search domain
            let domain = [];
            
            if (actionName) {
                domain.push('|', '|', '|');
                domain.push(['name', 'ilike', actionName]);
                domain.push(['xml_id', 'ilike', actionName]);
                // Also search by the action name with underscores replaced by spaces
                domain.push(['name', 'ilike', actionName.replace(/_/g, ' ')]);
                // And with module prefix
                domain.push(['xml_id', 'ilike', `%.${actionName}`]);
            }
            
            if (resModel) {
                domain = domain.length > 0 
                    ? ['&', ['res_model', '=', resModel], ...domain]
                    : [['res_model', '=', resModel]];
            }
            
            const actions = await this.orm.searchRead(
                "ir.actions.act_window",
                domain,
                ["id", "name", "res_model", "xml_id"],
                { limit: 5, order: 'id asc' }
            );
            
            if (actions && actions.length > 0) {
                // Prefer exact name match
                const exactMatch = actions.find(a => 
                    a.name && a.name.toLowerCase() === actionName.toLowerCase()
                );
                if (exactMatch) {
                    console.log("✅ Found exact match:", exactMatch);
                    return exactMatch.id;
                }
                
                // Fall back to first result
                console.log("✅ Found action:", actions[0]);
                return actions[0].id;
            }
            
            // Also try client actions
            const clientActions = await this.orm.searchRead(
                "ir.actions.client",
                [['tag', 'ilike', actionName]],
                ["id", "name", "tag"],
                { limit: 1 }
            );
            
            if (clientActions && clientActions.length > 0) {
                console.log("✅ Found client action:", clientActions[0]);
                return { type: 'client', id: clientActions[0].id, tag: clientActions[0].tag };
            }
            
        } catch (e) {
            console.warn("Could not resolve action by name/model:", e);
        }
        
        return null;
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
            // Task Management module
            'task.management': [
                'task_management.assets_backend',
            ],
            'task.team': [
                'task_management.assets_backend',
            ],
            'task.subtask': [
                'task_management.assets_backend',
            ],
            // Appraisal module
            'hr.appraisal': [
                'oh_appraisal.assets_backend',
                'oh_appraisal_ext.assets_backend',
            ],
            'oh.appraisal.master': [
                'oh_appraisal_ext.assets_backend',
            ],
            'oh.appraisal.okr.template': [
                'oh_appraisal_ext.assets_backend',
            ],
            // Announcements/Reward Warning
            'hr.announcement': [
                'hr_reward_warning.assets_backend',
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
            } else if (moduleName === 'task') {
                bundlesToLoad.add('task_management.assets_backend');
            } else if (moduleName === 'oh') {
                bundlesToLoad.add('oh_appraisal_ext.assets_backend');
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
            
            // Time Off / HR Holidays
            'hr_holidays.hr_leave_action_new_request': [
                'web.assets_backend_lazy',
                'web_calendar.calendar_assets',
                'calendar.assets_calendar',
                'calendar.assets_backend',
            ],
            'hr_holidays.hr_leave_action_my_request': [
                'web.assets_backend_lazy',
                'web_calendar.calendar_assets',
                'calendar.assets_calendar',
            ],
            'hr_holidays.action_hr_leave_dashboard': [
                'web.assets_backend_lazy',
                'web_calendar.calendar_assets',
                'calendar.assets_calendar',
            ],
            'hr_holidays.action_hr_holidays_dashboard': [
                'web.assets_backend_lazy',
                'web_calendar.calendar_assets',
                'calendar.assets_calendar',
            ],
            'hr_holidays.hr_leave_action_action_approve_department': [
                'web.assets_backend_lazy',
                'web_calendar.calendar_assets',
                'calendar.assets_calendar',
            ],
            
            // Project
            'project.action_view_all_task': ['project.assets_project'],
            
            // CRM
            'crm.action_pipeline': ['crm.assets_crm'],
            
            // Knowledge
            'knowledge.action_home': ['knowledge.assets_knowledge'],

            // OH Appraisal Extension - Master Template Dashboard
            'oh_appraisal_dashboard': [
                'oh_appraisal_ext.assets_backend',
            ],

            // Task Management
            'task_management_dashboard': [
                'task_management.assets_backend',
            ],
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
        
        // Special handling for underscored module names (e.g., oh_appraisal_ext)
        if (tag.includes('_')) {
            const underscoreModuleName = tag.split('_').slice(0, -1).join('_');
            if (underscoreModuleName && underscoreModuleName !== tag) {
                const additionalBundles = [
                    `${underscoreModuleName}.assets_backend`,
                ];
                additionalBundles.forEach(b => {
                    if (!bundlesToLoad.includes(b)) {
                        bundlesToLoad.push(b);
                    }
                });
            }
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

    setupClickOutsideHandler() {
        this._clickOutsideHandler = (event) => {
            // Close user menu if clicking outside
            if (this.state.userMenuOpen) {
                const dropdown = event.target.closest('.header_user_dropdown');
                if (!dropdown) {
                    this.state.userMenuOpen = false;
                }
            }
            // Close activities panel if clicking outside
            if (this.state.activitiesPanelOpen) {
                const panel = event.target.closest('.activities_dropdown_panel');
                const btn = event.target.closest('.header_icon_btn');
                if (!panel && !btn) {
                    this.state.activitiesPanelOpen = false;
                }
            }
            // Close messages panel if clicking outside
            if (this.state.messagesPanelOpen) {
                const panel = event.target.closest('.messages_dropdown_panel');
                const btn = event.target.closest('.header_icon_btn');
                if (!panel && !btn) {
                    this.state.messagesPanelOpen = false;
                }
            }
        };
        document.addEventListener('click', this._clickOutsideHandler);
    }

    cleanup() {
        try {
            // Remove click outside handler
            if (this._clickOutsideHandler) {
                document.removeEventListener('click', this._clickOutsideHandler);
                this._clickOutsideHandler = null;
            }
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

            // Add this block
            if (this.activitiesChartInstance) {
                try {
                    this.activitiesChartInstance.destroy();
                } catch (e) {}
                this.activitiesChartInstance = null; // clear reference
            }
            if (this.activitiesChartPopupInstance) {
                try {
                    this.activitiesChartPopupInstance.destroy();
                } catch (e) {}
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
        console.log("🏷️ Loading client action by tag:", tag);
        
        try {
            // First try to find the client action by exact tag match
            let clientAction = await this.orm.searchRead(
                "ir.actions.client",
                [["tag", "=", tag]],
                ["id", "name", "tag", "params", "context"],
                { limit: 1 }
            );

            if (!clientAction || clientAction.length === 0) {
                // Try searching with ilike for partial matches
                clientAction = await this.orm.searchRead(
                    "ir.actions.client",
                    [["tag", "ilike", tag]],
                    ["id", "name", "tag", "params", "context"],
                    { limit: 1 }
                );
            }

            if (clientAction && clientAction.length > 0) {
                console.log("✅ Found client action:", clientAction[0]);
                return this.loadClientAction(clientAction[0].id);
            }

            // If still not found but we have original action data, try to mount directly
            if (originalAction) {
                console.log("📦 Mounting client action directly from original action data");
                
                // Set loading state
                this.embeddedState.loading = true;
                this.embeddedState.errorMessage = null;
                this.embeddedState.isClientAction = true;
                this.embeddedState.clientActionMounted = false;
                this.embeddedState.isEmbeddedMode = true;
                this.state.currentView = "embedded";

                this.embeddedState.viewTitle = originalAction.name || tag;
                
                const actionData = {
                    id: originalAction.id || null,
                    tag: tag,
                    name: originalAction.name || tag,
                    params: originalAction.params || {},
                    context: originalAction.context || {},
                };

                await this.doMountClientAction(actionData);
                return;
            }

            throw new Error(`Client action with tag "${tag}" not found`);
        } catch (error) {
            console.error("❌ Failed to load client action by tag:", error);
            this.embeddedState.errorMessage = error.message || "Failed to load application";
            this.embeddedState.loading = false;
            this.notification.add(
                _t("Failed to load application: ") + (error.message || "Unknown error"),
                { type: "danger" }
            );
        }
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
            let mergedDomain = [...domain];
            let mergedContext = { ...context };
            
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
                    mergedDomain = [...actionDomain.filter(d => {
                        // Don't include duplicate employee_id domains
                        if (Array.isArray(d) && d[0] === 'employee_id') {
                            return !mergedDomain.some(ud => Array.isArray(ud) && ud[0] === 'employee_id');
                        }
                        return true;
                    }), ...domain];
                    
                    mergedContext = { ...actionContext, ...context };
                    
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
            this.embeddedState.currentDomain = mergedDomain;
            this.embeddedState.currentContext = mergedContext;

            // Load available view types
            await this.loadAvailableViewTypes(resModel);

            if (!this.embeddedState.availableViewTypes.includes(viewType)) {
                viewType = this.embeddedState.availableViewTypes[0] || "list";
                this.embeddedState.currentViewType = viewType;
            }

            // For calendar view, use specialized method
            if (viewType === "calendar") {
                await this.loadCalendarViaAction(resModel, title, mergedDomain, mergedContext);
            } else {
                this.buildDynamicViewProps(resModel, viewType, mergedDomain, mergedContext);
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
            const cleanDomain = this.cleanDomain(this.replaceDomainVariables(domain));
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
            
            const cleanDomain = this.cleanDomain(this.replaceDomainVariables(domain));
            const cleanContext = this.cleanContext(context);
            const self = this;

            // Add user ID to context if available (helps with uid-based domains)
            if (this.state.currentUserId && !cleanContext.uid) {
                cleanContext.uid = this.state.currentUserId;
            }

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
                // Explicitly enable CRUD operations for all views
                allowSelectionExport: true,
                showButtons: true,
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

            // CRITICAL FIX: Only add these props for non-Settings views
            // Settings form views don't accept these custom props
            const isSettingsView = resModel === 'res.config.settings' || 
                                resModel === 'base.config.settings' ||
                                this.embeddedState.viewTitle?.toLowerCase().includes('settings');
            
            if (!isSettingsView) {
                // Only add custom props for non-Settings views
                props.allowSelectionExport = true;
                props.showButtons = true;
                props.selectRecord = (id, opts) => this.handleSelectRecord(resModel, id, opts);
                props.createRecord = () => this.handleCreateRecord(resModel);
                props.onClickViewButton = async (params) => {
                    const clickParams = params.clickParams || params;
                    
                    if (clickParams.type === 'action' && clickParams.name) {
                        let actionId = self.extractActionId(clickParams.name);
                        if (!actionId && clickParams.name.includes('.')) {
                            actionId = await self.resolveXmlIdToActionId(clickParams.name);
                        }
                        if (actionId) {
                            await self.loadActionById(actionId);
                            return true;
                        }
                    }
                    
                    if (clickParams.type === 'object' && clickParams.name) {
                        try {
                            const result = await self.orm.call(
                                resModel,
                                clickParams.name,
                                resId ? [[resId]] : [[]],
                                { context: cleanContext }
                            );
                            if (result && typeof result === 'object' && result.type) {
                                await self.actionService.doAction(result);
                            }
                            return true;
                        } catch (e) {
                            console.error("Error executing method:", e);
                            return false;
                        }
                    }
                    return false;
                };
            }

            if (this.embeddedState.currentActionId) {
                props.actionId = this.embeddedState.currentActionId;
            }
            
            // Add views from the action to ensure the correct view is used
            // views is an array of [viewId, viewType] pairs
            if (this.embeddedState.currentViews && this.embeddedState.currentViews.length > 0) {
                props.views = this.embeddedState.currentViews;
                
                // Also set the specific viewId for the current view type
                const currentViewInfo = this.embeddedState.currentViews.find(v => v[1] === viewType);
                if (currentViewInfo && currentViewInfo[0]) {
                    props.viewId = currentViewInfo[0];
                }
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
        
        // Keys to exclude - these restrict functionality in embedded views
        const excludeKeys = [
            'create', 'edit', 'delete', 'duplicate', 
            'form_view_initial_mode', 'import', 'export_xlsx'
        ];
        
        for (const [key, value] of Object.entries(context)) {
            if (value === undefined || value === null) continue;
            if (typeof value === 'string' && value.includes('uid')) continue;
            if (typeof value === 'string' && value.includes('active_id')) continue;
            
            // Skip restrictive flags to allow full functionality
            if (excludeKeys.includes(key)) continue;
            
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
        
        // Return domain as-is - Odoo will handle uid and other special values
        // We only filter out completely invalid entries
        try {
            return domain.filter(item => {
                // Keep logical operators
                if (typeof item === 'string' && ['&', '|', '!'].includes(item)) {
                    return true;
                }
                // Keep valid domain tuples
                if (Array.isArray(item) && item.length === 3) {
                    const [field, operator, value] = item;
                    if (typeof field !== 'string') return false;
                    // Don't filter out uid - it's a valid Odoo variable
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
            this.embeddedState.viewTitle = lastCrumb.name;

            // Use calendar-specific loading if going back to calendar
            if (previousType === "calendar") {
                this.loadCalendarViaAction(
                    this.embeddedState.currentResModel,
                    lastCrumb.name,
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
                // Check if this is a known app that uses client actions
                const appName = (app.name || "").toLowerCase();
                
                // Handle appraisal module specifically
                if (appName.includes('appraisal') || appName.includes('assessment')) {
                    // Try to find the appraisal dashboard client action
                    const appraisalAction = await this.orm.searchRead(
                        "ir.actions.client",
                        [['tag', '=', 'oh_appraisal_dashboard']],
                        ["id"],
                        { limit: 1 }
                    );
                    if (appraisalAction && appraisalAction.length > 0) {
                        await this.loadClientAction(appraisalAction[0].id);
                        return;
                    }
                }
                
                // Handle task management module
                if (appName.includes('task') && !appName.includes('project')) {
                    // Try to find task management action
                    const taskAction = await this.resolveXmlIdToActionId('task_management.action_all_tasks');
                    if (taskAction) {
                        await this.loadActionById(taskAction);
                        return;
                    }
                }
                
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
            // ADD: Task Management models
            "task.management": "tasks",
            "task.team": "tasks",
            // ADD: Appraisal models
            "oh.appraisal.okr.template": "appraisal",
            "oh.appraisal.master": "appraisal",
            // ADD: Announcement models
            "hr.announcement": "announcements",
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
                    views: [...(this.embeddedState.currentViews || [])],
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
                    
                    console.log("📋 Raw action data:", {
                        view_mode: action.view_mode,
                        views: action.views,
                        res_model: action.res_model
                    });
                    
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

                    // LAYER 1: Define what we support and what we don't
                    const supportedViewTypes = ["list", "kanban", "form", "calendar", "pivot", "graph", "activity"];
                    const bannedViewTypes = ["hierarchy", "qweb", "search"];
                    
                    // LAYER 2: Clean view_mode string - remove banned types immediately
                    let viewModeString = action.view_mode || "list";
                    bannedViewTypes.forEach(banned => {
                        const regex = new RegExp(`\\b${banned}\\b,?`, 'gi');
                        viewModeString = viewModeString.replace(regex, '');
                    });
                    // Clean up extra commas
                    viewModeString = viewModeString.replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
                    if (!viewModeString) viewModeString = "list";
                    
                    console.log("🧹 Cleaned view_mode:", viewModeString);
                    
                    // Parse cleaned view modes
                    let viewModes = viewModeString.split(",").map(v => v.trim()).filter(v => v);
                    
                    // LAYER 3: Normalize tree to list and filter
                    viewModes = viewModes
                        .map(v => v === "tree" ? "list" : v)
                        .filter(v => supportedViewTypes.includes(v) && !bannedViewTypes.includes(v));
                    
                    // LAYER 4: Clean action.views array - remove banned view types
                    let actionViews = [];
                    if (Array.isArray(action.views)) {
                        actionViews = action.views.filter(v => {
                            const viewType = v[1] === "tree" ? "list" : v[1];
                            return supportedViewTypes.includes(viewType) && !bannedViewTypes.includes(viewType);
                        });
                    }
                    
                    // Extract available view types from cleaned action.views
                    let availableViewTypes = actionViews
                        .map(v => v[1] === "tree" ? "list" : v[1])
                        .filter(v => supportedViewTypes.includes(v));
                    
                    console.log("✅ Filtered views:", {
                        viewModes,
                        actionViews: actionViews.map(v => v[1]),
                        availableViewTypes
                    });
                    
                    // LAYER 5: If no available views, fetch from database
                    if (availableViewTypes.length === 0) {
                        console.log("📋 No valid views in action, fetching from database...");
                        try {
                            const dbViews = await this.orm.searchRead(
                                "ir.ui.view",
                                [
                                    ["model", "=", action.res_model],
                                    ["type", "in", supportedViewTypes],
                                    ["type", "not in", bannedViewTypes]
                                ],
                                ["type"],
                                { limit: 50 }
                            );
                            
                            availableViewTypes = [...new Set(dbViews.map(v => 
                                v.type === "tree" ? "list" : v.type
                            ))].filter(v => supportedViewTypes.includes(v) && !bannedViewTypes.includes(v));
                            
                            console.log("✅ Found views in database:", availableViewTypes);
                        } catch (e) {
                            console.warn("Could not fetch views from database:", e);
                        }
                    }
                    
                    // LAYER 6: If still no views, use safe defaults
                    if (availableViewTypes.length === 0) {
                        console.log("⚠️ No views found, using safe defaults");
                        availableViewTypes = ["list", "form"];
                    }
                    
                    // LAYER 7: Select the best view type with multiple fallbacks
                    let viewType = null;
                    
                    // Try 1: First view mode that's available
                    for (const mode of viewModes) {
                        if (availableViewTypes.includes(mode) && !bannedViewTypes.includes(mode)) {
                            viewType = mode;
                            console.log("✅ Selected from viewModes:", viewType);
                            break;
                        }
                    }
                    
                    // Try 2: If res_id is specified, prefer form view
                    if (!viewType && action.res_id && availableViewTypes.includes("form")) {
                        viewType = "form";
                        console.log("✅ Selected form view (res_id present)");
                    }
                    
                    // Try 3: Fallback to preferred order
                    if (!viewType) {
                        const fallbackOrder = ["list", "kanban", "form", "calendar", "graph", "pivot", "activity"];
                        for (const fallback of fallbackOrder) {
                            if (availableViewTypes.includes(fallback) && !bannedViewTypes.includes(fallback)) {
                                viewType = fallback;
                                console.log("✅ Selected from fallback order:", viewType);
                                break;
                            }
                        }
                    }
                    
                    // Try 4: First available view
                    if (!viewType && availableViewTypes.length > 0) {
                        viewType = availableViewTypes[0];
                        console.log("✅ Selected first available:", viewType);
                    }
                    
                    // Try 5: Ultimate fallback
                    if (!viewType || bannedViewTypes.includes(viewType)) {
                        viewType = "list";
                        console.log("⚠️ Using ultimate fallback: list");
                    }

                    console.log("🎯 Final view type:", viewType);

                    // LAYER 8: Final safety check
                    if (bannedViewTypes.includes(viewType)) {
                        console.error("❌ Banned view type detected:", viewType);
                        viewType = "list";
                    }

                    const domain = this.parseDomainSafe(action.domain);
                    const context = this.parseContextSafe(action.context);

                    this.embeddedState.currentResModel = action.res_model;
                    this.embeddedState.currentViewType = viewType;
                    this.embeddedState.currentDomain = domain;
                    this.embeddedState.currentContext = context;
                    this.embeddedState.currentResId = action.res_id || false;
                    this.embeddedState.currentActionId = numericId;
                    this.embeddedState.isClientAction = false;
                    
                    // Store cleaned views
                    this.embeddedState.currentViews = actionViews;
                    this.embeddedState.availableViewTypes = availableViewTypes;

                    if (action.name) {
                        this.embeddedState.viewTitle = action.name;
                        const currentBreadcrumbs = [...this.embeddedState.breadcrumbs];
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
        this.embeddedState.currentViews = previousState.views || [];
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
            return this.cleanDomain(this.replaceDomainVariables(domainValue));
        }
        // Handle string domains (e.g., "[('field', '=', 'value')]")
        if (typeof domainValue === 'string') {
            try {
                // Replace uid with actual user ID before parsing
                const userId = this.state.currentUserId || this.state.employee?.user_id;
                let domainStr = domainValue;
                
                // Replace Python-style uid with actual numeric value
                // Match uid that's not part of a larger word (e.g., not 'create_uid')
                // This handles: uid, (uid), =uid, in uid, etc.
                if (userId) {
                    // Replace standalone uid (not part of field name like create_uid)
                    // Match uid when it appears as a value (after operators)
                    domainStr = domainStr.replace(/,\s*uid\s*\)/g, `, ${userId})`);
                    domainStr = domainStr.replace(/,\s*uid\s*]/g, `, ${userId}]`);
                }
                
                // Convert Python tuple syntax to JSON array syntax
                // Replace ( with [ and ) with ] for tuples inside the domain
                // But be careful: ('field', '=', 'value') -> ["field", "=", "value"]
                domainStr = domainStr
                    .replace(/\(/g, '[')  // Replace ( with [
                    .replace(/\)/g, ']')  // Replace ) with ]
                    .replace(/'/g, '"')   // Replace ' with "
                    .replace(/True/g, 'true')
                    .replace(/False/g, 'false')
                    .replace(/None/g, 'null');
                
                // Try to parse as JSON
                const parsed = JSON.parse(domainStr);
                if (Array.isArray(parsed)) {
                    return this.cleanDomain(this.replaceDomainVariables(parsed));
                }
            } catch (e) {
                // If parsing fails, log at debug level and return empty domain
                // The server will handle the domain correctly, we just can't use it client-side
                console.debug("Domain string not parseable client-side (will be handled server-side):", domainValue);
            }
        }
        return [];
    }

    /**
     * Replace uid and other variables in domain with actual values
     */
    replaceDomainVariables(domain) {
        if (!Array.isArray(domain)) return domain;
        
        const userId = this.state.currentUserId || this.state.employee?.user_id;
        
        return domain.map(item => {
            if (Array.isArray(item) && item.length === 3) {
                const [field, operator, value] = item;
                // Replace 'uid' string value with actual user ID
                if (value === 'uid' && userId) {
                    return [field, operator, userId];
                }
            }
            return item;
        });
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
            let domain = module 
                ? [["module", "=", module], ["name", "=", name]]
                : [["name", "=", name]];
            
            let result = await this.orm.searchRead(
                "ir.model.data",
                domain,
                ["res_id", "model"],
                { limit: 1 }
            );
            
            // If not found with exact match, try with ilike
            if (!result || result.length === 0) {
                domain = module 
                    ? [["module", "=", module], ["name", "ilike", name]]
                    : [["name", "ilike", name]];
                    
                result = await this.orm.searchRead(
                    "ir.model.data",
                    domain,
                    ["res_id", "model"],
                    { limit: 1 }
                );
            }
            
            // If still not found and no module was specified, try common module prefixes
            if ((!result || result.length === 0) && !module) {
                const commonModules = [
                    'task_management', 'oh_appraisal_ext', 'hr_reward_warning',
                    'hr', 'project', 'hr_holidays', 'hr_attendance'
                ];
                
                for (const mod of commonModules) {
                    const modResult = await this.orm.searchRead(
                        "ir.model.data",
                        [["module", "=", mod], ["name", "=", name]],
                        ["res_id", "model"],
                        { limit: 1 }
                    );
                    if (modResult && modResult.length > 0) {
                        result = modResult;
                        break;
                    }
                }
            }
            
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
        this.embeddedState.currentViews = [];
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
        // Employee Applications (EAMS) - count only 'submitted' for current employee
        let employeeApplicationsCount = 0;
        try {
            const empId = this.state.employee?.id;
            let domain = [["state", "=", "submitted"]];
            if (empId) {
                domain.push(["employee_id", "=", empId]);
            }
            employeeApplicationsCount = await this.orm.searchCount("eams.employee.application", domain);
        } catch (e) {
            employeeApplicationsCount = 0;
        }
        this.state.managerEmployeeApplicationsCount = employeeApplicationsCount;
        // Fetch ongoing activities counts using backend method for accurate mapping
        try {
            const activityTypes = await this.orm.call("hr.employee", "get_dashboard_activity_types", []);
            // Map backend types to our dashboard cards
            const typeMap = {
                todo: ["to-do", "todo", "to do", "to_do"],
                call: ["call"],
                meeting: ["meeting", "meet"],
                email: ["email", "mail"],
                followup: ["followup", "follow-up", "follow up"],
            };
            const counts = { todo: 0, call: 0, meeting: 0, email: 0, followup: 0 };
            for (const key in typeMap) {
                const found = activityTypes.find(t => typeMap[key].some(syn => (t.name || '').toLowerCase().includes(syn)));
                counts[key] = found ? found.count : 0;
            }
            this.state.ongoingActivities = counts;
        } catch (e) {
            this.state.ongoingActivities = { todo: 0, call: 0, meeting: 0, email: 0, followup: 0 };
        }
        const activitiesTrend = await this.orm.call(
            "hr.employee",
            "employee_activities_trend",
            []
        );
        this.state.activitiesChartData = activitiesTrend || [];

        try {
            // 1. Check if user is manager
            try {
                this.state.isManager = await this.orm.call("hr.employee", "check_user_group", []);
            } catch (e) {
                console.warn("Failed to check user group:", e);
                this.state.isManager = false;
            }

            // 2. Get employee details
            let employeeId = false;
            try {
                const empDetails = await this.orm.call("hr.employee", "get_user_employee_details", []);
                console.log("[DASHBOARD] Received employee details from backend:", empDetails);
                if (empDetails && empDetails[0] && empDetails[0].id) {
                    // Always ensure employee is an object and preserve card counts if already set
                    this.state.employee = Object.assign({
                        payslip_count: 0,
                        emp_timesheets: 0,
                        contracts_count: 0,
                        documents_count: 0,
                        announcements_count: 0,
                    }, empDetails[0]);
                    // Store leave balance summary
                    if (empDetails[0].leave_balance_summary) {
                        this.state.leaveBalanceSummary = empDetails[0].leave_balance_summary;
                    }
                    console.log("[DASHBOARD] Mapped state.employee:", this.state.employee);
                    employeeId = empDetails[0].id;
                    this.state.attendance = empDetails[0].attendance_lines || [];
                    this.state.leaves = empDetails[0].leave_lines || [];
                    this.state.expenses = empDetails[0].expense_lines || [];
                } else {
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
                        documents_count: 0,
                        announcements_count: 0,
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
                this.state.employee = {
                    id: false,
                    name: 'User',
                    attendance_state: 'checked_out',
                    payslip_count: 0,
                    emp_timesheets: 0,
                    contracts_count: 0,
                    documents_count: 0,
                    announcements_count: 0,
                };
            }


            // 3. Fetch card counts directly from the actual list views' models
            // Timesheets: Task Management > task.timesheet.line (uses user_id, not employee_id)
            let timesheetCount = 0;
            let timesheetPlannedHours = 0;
            let timesheetActualHours = 0;
            try {
                let timesheetDomain = [];
                if (this.state.employee && this.state.employee.user_id) {
                    // task.timesheet.line uses user_id field, not employee_id
                    const userId = Array.isArray(this.state.employee.user_id)
                        ? this.state.employee.user_id[0]
                        : this.state.employee.user_id;
                    if (userId) {
                        timesheetDomain = [["user_id", "=", userId]];
                    }
                }
                if (timesheetDomain.length > 0) {
                    timesheetCount = await this.orm.searchCount("task.timesheet.line", timesheetDomain);
                    // Fetch all time logs for the user and sum planned/actual hours
                    const timesheetLines = await this.orm.searchRead(
                        "task.timesheet.line",
                        timesheetDomain,
                        ["planned_hours", "unit_amount"],
                        { limit: 1000 }
                    );
                    timesheetPlannedHours = timesheetLines.reduce((sum, l) => sum + (parseFloat(l.planned_hours) || 0), 0);
                    timesheetActualHours = timesheetLines.reduce((sum, l) => sum + (parseFloat(l.unit_amount) || 0), 0);
                    console.log("[DASHBOARD] Timesheet count:", timesheetCount, "Planned:", timesheetPlannedHours, "Actual:", timesheetActualHours);
                } else {
                    console.warn("[DASHBOARD] No user_id found for employee, skipping timesheet count");
                }
            } catch (e) {
                console.error("[DASHBOARD] Error fetching timesheet count:", e);
                timesheetCount = 0;
                timesheetPlannedHours = 0;
                timesheetActualHours = 0;
            }

            // Payslips: Payroll > Employee Payslips (hr.payslip)
            let payslipCount = 0;
            try {
                let payslipDomain = [];
                if (this.state.employee && this.state.employee.id) {
                    payslipDomain = [["employee_id", "=", this.state.employee.id]];
                }
                payslipCount = await this.orm.searchCount("hr.payslip", payslipDomain);
                console.log("[DASHBOARD] Payslip count:", payslipCount, "domain:", payslipDomain);
            } catch (e) {
                console.error("[DASHBOARD] Error fetching payslip count:", e);
                payslipCount = 0;
            }

            // Documents: Employees > Documents (hr.employee.document with correct field)
            let docCount = 0;
            try {
                let docDomain = [];
                if (this.state.employee && this.state.employee.id) {
                    docDomain = [["employee_ref_id", "=", this.state.employee.id]];
                }
                docCount = await this.orm.searchCount("hr.employee.document", docDomain);
                console.log("[DASHBOARD] Document count from hr.employee.document:", docCount);
            } catch (e) {
                console.error("[DASHBOARD] Error fetching document count:", e);
                docCount = 0;
            }

            // Announcements: Announcements (hr.announcement) - match backend logic for all types
            let annCount = 0;
            try {
                const today = new Date().toISOString().split("T")[0];
                const empId = this.state.employee?.id;
                const depId = this.state.employee?.department_id?.[0] || this.state.employee?.department_id;
                const jobId = this.state.employee?.job_id?.[0] || this.state.employee?.job_id;
                // General
                const generalCount = await this.orm.searchCount("hr.announcement", [
                    ["is_announcement", "=", true],
                    ["state", "=", "approved"],
                    ["date_start", "<=", today]
                ]);
                // By Employee
                const empCount = empId ? await this.orm.searchCount("hr.announcement", [
                    ["employee_ids", "in", empId],
                    ["state", "=", "approved"],
                    ["date_start", "<=", today]
                ]) : 0;
                // By Department
                const depCount = depId ? await this.orm.searchCount("hr.announcement", [
                    ["department_ids", "in", depId],
                    ["state", "=", "approved"],
                    ["date_start", "<=", today]
                ]) : 0;
                // By Job Position
                const jobCount = jobId ? await this.orm.searchCount("hr.announcement", [
                    ["position_ids", "in", jobId],
                    ["state", "=", "approved"],
                    ["date_start", "<=", today]
                ]) : 0;
                annCount = generalCount + empCount + depCount + jobCount;
                console.log("[DASHBOARD] Announcement count (all types):", annCount, {generalCount, empCount, depCount, jobCount});
            } catch (e) {
                console.error("[DASHBOARD] Error fetching announcement count:", e);
                annCount = 0;
            }

            // Task List (task_management)
            let taskCount = 0;
            try {
                if (this.state.employee && this.state.employee.user_id) {
                    const userId = Array.isArray(this.state.employee.user_id)
                        ? this.state.employee.user_id[0]
                        : this.state.employee.user_id;
                    taskCount = await this.orm.searchCount("task.management", [["user_id", "=", userId], ["stage_id", "!=", false]]);
                }
            } catch (e) {
                console.error("[DASHBOARD] Error fetching task count:", e);
                taskCount = 0;
            }

            try {
                // Load tasks instead of projects
                const tasks = await this.orm.searchRead(
                    "task.management",
                    [
                        ["user_id", "=", this.state.currentUserId || this.state.employee?.user_id?.[0]]
                    ],
                    ["name", "priority", "deadline", "stage_id"],
                    { limit: 10, order: "deadline asc" }
                );
                this.state.tasks = tasks.map(t => ({
                    id: t.id,
                    name: t.name || '',
                    priority: t.priority || 'Normal',
                    deadline: t.deadline ? t.deadline.split(' ')[0] : '-',
                    stage: t.stage_id ? t.stage_id[1] : 'New',
                }));
            } catch (e) {
                console.warn("Could not load tasks:", e);
                this.state.tasks = [];
            }

            // Working Hours (sum of worked_hours in attendance)
            let workingHours = 0;
            try {
                if (this.state.attendance && this.state.attendance.length) {
                    workingHours = this.state.attendance.reduce((sum, att) => sum + (parseFloat(att.worked_hours) || 0), 0);
                }
            } catch (e) {
                console.error("[DASHBOARD] Error calculating working hours:", e);
                workingHours = 0;
            }
            // Format to two decimal places for display
            const workingHoursDisplay = Number(workingHours).toFixed(2);

            // Attendance Trend Chart Data (group by date, sum worked_hours)
            let attendanceChartData = [];
            try {
                if (this.state.attendance && this.state.attendance.length) {
                    const grouped = {};
                    this.state.attendance.forEach(att => {
                        if (!grouped[att.date]) grouped[att.date] = 0;
                        grouped[att.date] += parseFloat(att.worked_hours) || 0;
                    });
                    attendanceChartData = Object.entries(grouped).map(([date, hours]) => ({ date, hours }));
                }
            } catch (e) {
                console.error("[DASHBOARD] Error preparing attendance chart data:", e);
                attendanceChartData = [];
            }

            // Leave Trend Chart Data (group by month, count leaves)
            let leaveChartData = [];
            try {
                if (this.state.leaves && this.state.leaves.length) {
                    const grouped = {};
                    this.state.leaves.forEach(leave => {
                        const month = (leave.request_date_from || '').slice(0, 7); // YYYY-MM
                        if (!grouped[month]) grouped[month] = 0;
                        grouped[month] += 1;
                    });
                    leaveChartData = Object.entries(grouped).map(([month, count]) => ({ month, count }));
                }
            } catch (e) {
                console.error("[DASHBOARD] Error preparing leave chart data:", e);
                leaveChartData = [];
            }

            // Update all counts and new quick stats reactively in one go
            this.state.employee = {
                ...this.state.employee,
                timesheet_count: timesheetCount,
                payslip_count: payslipCount,
                documents_count: docCount,
                announcements_count: annCount,
                working_hours: workingHoursDisplay,
                employee_applications: employeeApplicationsCount,
            };
            this.state.timesheet_planned_hours = timesheetPlannedHours;
            this.state.timesheet_actual_hours = timesheetActualHours;
            this.state.task_count = taskCount;
            this.state.working_hours = workingHoursDisplay;
            this.state.attendanceChartData = attendanceChartData;
            this.state.leaveChartData = leaveChartData;
            console.log("[DASHBOARD] Updated employee counts and quick stats:", {
                timesheet_count: timesheetCount,
                payslip_count: payslipCount,
                documents_count: docCount,
                announcements_count: annCount,
                task_count: taskCount,
                working_hours: workingHours,
                attendanceChartData,
                leaveChartData,
            });

            // Load additional data: projects, upcoming events, charts
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
            await this.loadActivitiesTrendData(); // ADD THIS LINE

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

    // Add these methods
    async addTask() {
        try {
            // Try to open Task Management form
            const actionId = await this.resolveXmlIdToActionId('task_management.action_my_tasks');
            
            if (actionId) {
                await this.actionService.doAction({
                    type: "ir.actions.act_window",
                    name: _t("New Task"),
                    res_model: "task.management",
                    views: [[false, "form"]],
                    target: "new",
                    context: this.state.employee?.user_id ? {
                        default_user_id: Array.isArray(this.state.employee.user_id) 
                            ? this.state.employee.user_id[0] 
                            : this.state.employee.user_id
                    } : {},
                });
            }
        } catch (error) {
            console.error("Failed to open task form:", error);
            this.notification.add(_t("Failed to open task form"), { type: "warning" });
        }
    }

    async openAllTasks() {
        try {
            const actionId = await this.resolveXmlIdToActionId('task_management.action_my_tasks');
            if (actionId) {
                this.embeddedState.activeSidebarItem = "operations";
                await this.loadActionById(actionId);
            } else {
                // Fallback
                if (this.state.employee?.user_id) {
                    const userId = Array.isArray(this.state.employee.user_id)
                        ? this.state.employee.user_id[0]
                        : this.state.employee.user_id;
                    await this.loadEmbeddedView("task.management", "My Tasks", [
                        ["user_id", "=", userId]
                    ], "list");
                }
            }
        } catch (error) {
            this.notification.add(_t("Could not open tasks"), { type: "warning" });
        }
    }

    async onTaskRowClick(task) {
        await this.actionService.doAction({
            type: "ir.actions.act_window",
            name: _t("Task"),
            res_model: "task.management",
            res_id: task.id,
            views: [[false, "form"]],
            target: "new",
        });
    }

    async loadActivitiesTrendData() {
        if (!this.state.currentUserId) return;
        
        try {
            // Call the new backend method that gets activity types with counts
            const activityTypes = await this.orm.call(
                "hr.employee",
                "get_dashboard_activity_types",
                []
            );
            
            // Transform to chart format
            this.state.activitiesChartData = activityTypes.map(type => ({
                type: (type.name || '').toLowerCase().replace(/\s+/g, '_'),
                label: type.name,
                count: type.count,
                color: type.color,
                typeId: type.type_id,
            }));
            
            console.log("[DASHBOARD] Activities chart data loaded:", this.state.activitiesChartData);
        } catch (error) {
            console.error("Failed to load activities trend data:", error);
            this.state.activitiesChartData = [];
        }
    }

    async loadChartData() {
        try {
            const leaveData = await this.orm.call("hr.employee", "employee_leave_trend", []);
            this.state.leaveChartData = leaveData || [];

            const attendanceData = await this.orm.call("hr.employee", "employee_attendance_trend", []);
            this.state.attendanceChartData = attendanceData || [];
            
            // Load activities trend
            await this.loadActivitiesTrendData();

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

    async loadUserMenuData() {
        try {
            // Get current user ID from employee data (loaded in loadInitialData)
            this.state.currentUserId = this.state.employee?.user_id || false;

            if (this.state.currentUserId) {
                // Load activity count
                try {
                    const activities = await this.orm.searchCount("mail.activity", [
                        ["user_id", "=", this.state.currentUserId],
                    ]);
                    this.state.activityCount = activities || 0;
                } catch (e) {
                    this.state.activityCount = 0;
                }

                // Load unread message count
                try {
                    const messages = await this.orm.searchCount("mail.message", [
                        ["needaction", "=", true],
                    ]);
                    this.state.messageCount = messages || 0;
                } catch (e) {
                    this.state.messageCount = 0;
                }
            }

            // Load company info from employee data
            if (this.state.employee?.company_id) {
                this.state.currentCompany = {
                    id: this.state.employee.company_id[0],
                    name: this.state.employee.company_id[1] || "Company"
                };
            }
        } catch (error) {
            console.error("Failed to load user menu data:", error);
            // Set defaults if loading fails
            this.state.activityCount = 0;
            this.state.messageCount = 0;
        }
    }

    // User Menu Methods
    toggleUserMenu() {
        this.closeActivitiesPanel();
        this.closeMessagesPanel();
        this.state.userMenuOpen = !this.state.userMenuOpen;
    }

    closeUserMenu() {
        this.state.userMenuOpen = false;
    }

    // Activities Panel Methods
    async toggleActivitiesPanel() {
        this.closeUserMenu();
        this.closeMessagesPanel();
        const wasOpen = this.state.activitiesPanelOpen;
        this.state.activitiesPanelOpen = !wasOpen;
        if (!wasOpen) {
            await this.loadActivitiesSummary();
        }
    }

    closeActivitiesPanel() {
        this.state.activitiesPanelOpen = false;
    }

    async loadActivitiesSummary() {
        if (!this.state.currentUserId) return;
        try {
            // Load activities grouped by activity type
            const activities = await this.orm.searchRead(
                "mail.activity",
                [["user_id", "=", this.state.currentUserId]],
                ["activity_type_id", "date_deadline", "res_model", "res_name", "summary"]
            );

            // Group activities by type and categorize by date
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const typeMap = {};

            for (const act of activities) {
                const typeName = act.activity_type_id ? act.activity_type_id[1] : "Other";
                const typeId = act.activity_type_id ? act.activity_type_id[0] : 0;
                
                if (!typeMap[typeId]) {
                    typeMap[typeId] = {
                        type: typeId,
                        name: typeName,
                        icon: this.getActivityIcon(typeName),
                        color: this.getActivityColor(typeName),
                        overdue: 0,
                        today: 0,
                        planned: 0
                    };
                }

                const deadline = new Date(act.date_deadline);
                deadline.setHours(0, 0, 0, 0);

                if (deadline < today) {
                    typeMap[typeId].overdue++;
                } else if (deadline.getTime() === today.getTime()) {
                    typeMap[typeId].today++;
                } else {
                    typeMap[typeId].planned++;
                }
            }

            this.state.activitiesSummary = Object.values(typeMap);
        } catch (error) {
            console.debug("Failed to load activities summary:", error);
            this.state.activitiesSummary = [];
        }
    }

    getActivityIcon(typeName) {
        const name = (typeName || "").toLowerCase();
        if (name.includes("task")) return "📋";
        if (name.includes("todo") || name.includes("to-do") || name.includes("to do")) return "✓";
        if (name.includes("call")) return "📞";
        if (name.includes("meet")) return "📅";
        if (name.includes("email") || name.includes("mail")) return "✉️";
        if (name.includes("upload") || name.includes("document")) return "📎";
        return "🎯";
    }

    getActivityColor(typeName) {
        const name = (typeName || "").toLowerCase();
        if (name.includes("task")) return "#875A7B";
        if (name.includes("todo") || name.includes("to-do")) return "#17a2b8";
        if (name.includes("call")) return "#28a745";
        if (name.includes("meet")) return "#ffc107";
        if (name.includes("email") || name.includes("mail")) return "#dc3545";
        if (name.includes("upload") || name.includes("document")) return "#6c757d";
        return "#007bff";
    }

    async openActivityType(typeKey) {
        this.closeActivitiesPanel && this.closeActivitiesPanel();
        const userId = this.state.currentUserId || this.state.employee?.user_id || this.state.employee?.id;
        if (!userId) return;
        // Map typeKey to activity_type_id name
        const typeMap = {
            todo: ["to_do", "todo", "to-do", "to do"],
            call: ["call"],
            meeting: ["meeting", "meet"],
            email: ["email", "mail"],
            followup: ["followup", "follow-up", "follow up"],
        };
        let activityTypeIds = [];
        // Fetch all activity types and match by name
        const allTypes = await this.orm.searchRead("mail.activity.type", [], ["id", "name"]);
        for (const t of allTypes) {
            const name = (t.name || "").toLowerCase();
            if (typeMap[typeKey] && typeMap[typeKey].some(n => name.includes(n))) {
                activityTypeIds.push(t.id);
            }
        }
        const domain = [["user_id", "=", userId]];
        if (activityTypeIds.length) {
            domain.push(["activity_type_id", "in", activityTypeIds]);
        }
        this.embeddedState.activeSidebarItem = "operations";
        await this.loadEmbeddedView("mail.activity", "Activities", domain, "list");
    }

    async openAllActivities() {
        this.closeActivitiesPanel();
        if (!this.state.currentUserId) return;
        this.embeddedState.activeSidebarItem = "operations";
        await this.loadEmbeddedView("mail.activity", "All Activities", [
            ["user_id", "=", this.state.currentUserId],
        ], "list");
    }

    // Messages Panel Methods
    async toggleMessagesPanel() {
        this.closeUserMenu();
        this.closeActivitiesPanel();
        const wasOpen = this.state.messagesPanelOpen;
        this.state.messagesPanelOpen = !wasOpen;
        if (!wasOpen) {
            await this.loadMessagesList();
        }
    }

    closeMessagesPanel() {
        this.state.messagesPanelOpen = false;
    }

    setMessagesTab(tab) {
        this.state.messagesTab = tab;
        this.loadMessagesList();
    }

    async loadMessagesList() {
        if (!this.state.currentUserId) return;
        try {
            let channels = [];
            const tab = this.state.messagesTab;

            // Try to load from discuss.channel (Odoo 18) or mail.channel (older versions)
            try {
                if (tab === "all" || tab === "channels") {
                    channels = await this.orm.searchRead(
                        "discuss.channel",
                        [["channel_member_ids.partner_id.user_ids", "in", [this.state.currentUserId]]],
                        ["name", "channel_type", "message_unread_counter", "image_128"],
                        { limit: 20 }
                    );
                }
                
                if (tab === "chats" && channels.length > 0) {
                    channels = channels.filter(c => c.channel_type === "chat");
                } else if (tab === "channels" && channels.length > 0) {
                    channels = channels.filter(c => c.channel_type === "channel" || c.channel_type === "group");
                }
            } catch (e) {
                // Fallback to mail.channel for older Odoo versions
                try {
                    channels = await this.orm.searchRead(
                        "mail.channel",
                        [],
                        ["name", "channel_type", "message_unread_counter", "image_128"],
                        { limit: 20 }
                    );
                } catch (e2) {
                    console.debug("Could not load channels:", e2);
                }
            }

            this.state.messagesList = channels.map(ch => ({
                id: ch.id,
                name: ch.name || "Direct Message",
                icon: ch.channel_type === "chat" ? "👤" : "#",
                preview: "",
                date: "",
                unread: ch.message_unread_counter || 0,
                avatar: ch.image_128 ? `data:image/png;base64,${ch.image_128}` : null,
                channelType: ch.channel_type
            }));
        } catch (error) {
            console.debug("Failed to load messages list:", error);
            this.state.messagesList = [];
        }
    }

    async openConversation(msg) {
        this.closeMessagesPanel();
        try {
            // Try to open the discuss app with the specific channel
            const discussApp = this.state.apps.find(app => 
                app.name.toLowerCase().includes("discuss") || 
                app.name.toLowerCase().includes("inbox")
            );
            if (discussApp) {
                await this.loadEmbeddedApp(discussApp);
            }
        } catch (error) {
            console.debug("Could not open conversation:", error);
        }
    }

    async openNewMessageComposer() {
        this.closeMessagesPanel();
        try {
            // Open Discuss app to compose new message
            const discussApp = this.state.apps.find(app => 
                app.name.toLowerCase().includes("discuss") || 
                app.name.toLowerCase().includes("inbox")
            );
            if (discussApp) {
                await this.loadEmbeddedApp(discussApp);
            }
        } catch (error) {
            this.notification.add(_t("Could not open message composer"), { type: "warning" });
        }
    }

    async openActivities() {
        this.state.userMenuOpen = false;
        // Open activities in embedded view
        if (!this.state.currentUserId) return;
        this.embeddedState.activeSidebarItem = "operations";
        await this.loadEmbeddedView("mail.activity", "My Activities", [
            ["user_id", "=", this.state.currentUserId],
        ], "list");
    }

    async openMessages() {
        this.state.userMenuOpen = false;
        // Open discuss/inbox - try to load it as embedded app
        try {
            // Find the Discuss app in our apps list
            const discussApp = this.state.apps.find(app => 
                app.name.toLowerCase().includes("discuss") || 
                app.name.toLowerCase().includes("inbox")
            );
            if (discussApp) {
                await this.loadEmbeddedApp(discussApp);
            } else {
                // Fallback: load mail.message model
                this.embeddedState.activeSidebarItem = "operations";
                await this.loadEmbeddedView("mail.message", "Messages", [
                    ["needaction", "=", true],
                ], "list");
            }
        } catch (error) {
            this.notification.add(_t("Could not open messages"), { type: "warning" });
        }
    }

    // User menu item actions
    openDocumentation() {
        this.closeUserMenu();
        window.open("https://www.odoo.com/documentation/18.0/", "_blank");
    }

    openSupport() {
        this.closeUserMenu();
        window.open("https://www.odoo.com/help", "_blank");
    }

    openShortcuts() {
        this.closeUserMenu();
        // Trigger the command palette (Ctrl+K equivalent)
        try {
            const event = new KeyboardEvent("keydown", {
                key: "k",
                code: "KeyK",
                ctrlKey: true,
                bubbles: true
            });
            document.dispatchEvent(event);
        } catch (e) {
            this.notification.add(_t("Press Ctrl+K to open command palette"), { type: "info" });
        }
    }

    openOdooAccount() {
        this.closeUserMenu();
        window.open("https://accounts.odoo.com/my/home", "_blank");
    }

    async openUserPreferences() {
        this.state.userMenuOpen = false;
        // Open user preferences form
        if (!this.state.currentUserId) return;
        try {
            this.embeddedState.activeSidebarItem = "profile";
            // Load form view for current user
            this.embeddedState.loading = true;
            this.embeddedState.errorMessage = null;
            this.embeddedState.isEmbeddedMode = true;
            this.embeddedState.isClientAction = false;
            this.embeddedState.viewTitle = "My Preferences";
            this.embeddedState.currentResModel = "res.users";
            this.embeddedState.currentResId = this.state.currentUserId;
            this.embeddedState.currentDomain = [];
            this.embeddedState.currentViewType = "form";
            this.embeddedState.currentMenus = [];
            this.embeddedState.breadcrumbs = [{ name: "My Preferences", type: 'view' }];
            this.state.currentView = "embedded";

            await this.loadViewBundles("res.users", "form");
            this.embeddedState.availableViewTypes = ["form"];
            this.buildDynamicViewProps("res.users", "form", [], {}, this.state.currentUserId);
            this.embeddedState.loading = false;
        } catch (error) {
            this.embeddedState.loading = false;
            this.embeddedState.errorMessage = "Could not open preferences";
            this.notification.add(_t("Could not open preferences"), { type: "warning" });
        }
    }

    async onLogout() {
        window.location.href = "/web/session/logout";
    }

    get userName() {
        return this.state.employee?.name || "User";
    }

    get userCompanyName() {
        return this.state.currentCompany?.name || "Company";
    }

    renderCharts() {
        if (!this.state.chartLoaded || typeof Chart === "undefined") return;
        
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            setTimeout(() => {
                this.renderLeaveChart();
                this.renderAttendanceChart();
                this.renderActivitiesChart();
                if (this.state.isManager) {
                    this.renderDeptChart();
                }

                // Activities Trend Chart
                if (this.state.activitiesChartData && this.state.activitiesChartData.length) {
                    const chartElem = document.getElementById("activitiesTrendChart");
                    if (!chartElem) return; // <--- FIX: do not proceed if not found in DOM
                    const ctx = chartElem.getContext("2d");
                    if (!ctx) return; // <--- FIX: skip if context cannot be obtained

                    if (this.activitiesChartInstance) {
                        try { this.activitiesChartInstance.destroy(); } catch (e) {}
                    }

                    this.activitiesChartInstance = new Chart(ctx, {
                        type: "line",
                        data: {
                            labels: this.state.activitiesChartData.map(x => x.month),
                            datasets: [{
                                label: "Activities",
                                data: this.state.activitiesChartData.map(x => x.count),
                                backgroundColor: "rgba(26, 115, 232, 0.20)",
                                borderColor: "#1a73e8",
                                borderWidth: 2,
                                fill: true,
                                tension: 0.4,
                                pointRadius: 4,
                                pointHoverRadius: 6,
                            }],
                        },
                        options: {
                            scales: {
                                y: { beginAtZero: true }
                            },
                            plugins: { legend: { display: true } }
                        }
                    });
                }
            }, 100);
        });

        
    }


    renderActivitiesChart() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoActivitiesChart");
        if (!canvas) {
            console.debug("Activities chart canvas not found in DOM");
            return;
        }
        if (!this.state.activitiesChartData || this.state.activitiesChartData.length === 0) {
            console.debug("No activities chart data available");
            return;
        }

        if (this.activitiesChartInstance) {
            try {
                this.activitiesChartInstance.destroy();
            } catch (e) {
                console.debug("Could not destroy previous chart instance");
            }
        }

        try {
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                console.warn("Could not get canvas context");
                return;
            }
            
            this.activitiesChartInstance = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: this.state.activitiesChartData.map(d => d.label || d.name),
                    datasets: [{
                        label: "Activities",
                        data: this.state.activitiesChartData.map(d => d.count),
                        backgroundColor: this.state.activitiesChartData.map(d => d.color),
                        borderColor: '#fff',
                        borderWidth: 2,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            display: false 
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.parsed.y + ' activities';
                                }
                            }
                        }
                    },
                    scales: { 
                        y: { 
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    },
                },
            });
        } catch (error) {
            console.error("Failed to render activities chart:", error);
        }
    }

    async openTaskList() {
        // Try to load Task Management module's "My Tasks" view
        try {
            // First, try to find the action by XML ID
            const actionId = await this.resolveXmlIdToActionId('task_management.action_my_tasks');
            
            if (actionId) {
                this.embeddedState.activeSidebarItem = "operations";
                await this.loadActionById(actionId);
            } else {
                // Fallback: load task.management model directly
                if (this.state.employee && this.state.employee.user_id) {
                    const userId = Array.isArray(this.state.employee.user_id)
                        ? this.state.employee.user_id[0]
                        : this.state.employee.user_id;
                        
                    this.embeddedState.activeSidebarItem = "operations";
                    await this.loadEmbeddedView("task.management", "My Tasks", [
                        ["user_id", "=", userId]
                    ], "list");
                } else {
                    this.notification.add(_t("Could not load tasks"), { type: "warning" });
                }
            }
        } catch (error) {
            console.error("Failed to open task list:", error);
            this.notification.add(_t("Task Management module may not be installed"), { type: "warning" });
        }
    }



    async renderActivitiesTrendChart(canvas, data = null, options = {}) {
        // If data is not supplied, grab from state
        if (!data) {
            data = this.state.activitiesChartData;
        }
        if (!canvas) return;
        // Destroy existing chart instance if it exists
        if (canvas._chartInstance) {
            canvas._chartInstance.destroy();
        }

        const months = data.map(d => d.month);
        const counts = data.map(d => d.count);

        // Use Chart.js (already loaded elsewhere)
        // Use same chart type as dashboard card (Line recommended)
        canvas._chartInstance = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Activities',
                    data: counts,
                    fill: true,
                    tension: 0.3,
                    borderColor: "#1a73e8",
                    backgroundColor: "rgba(26,115,232,0.08)",
                    pointBackgroundColor: "#1a73e8",
                    pointRadius: 5,
                    pointHoverRadius: 8,
                }],
            },
            options: Object.assign({
                responsive: true,
                plugins: {
                    legend: { display: true },
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true },
                }
            }, options)
        });
    }

    // Call this.chartLoaded = true after initial charts are rendered/loaded

    // In your popup logic (the function triggered on card click):

    openActivitiesTrendPopup() {
        this.state.activitiesTrendPopupOpen = true;

        // use setTimeout to allow DOM rendering first
        setTimeout(() => {
            const canvas = document.querySelector(".popup_chart_container canvas");
            if (canvas) {
                this.renderActivitiesTrendChart(canvas);
            }
        }, 10);
    }

    closeActivitiesTrendPopup() {
        this.state.activitiesTrendPopupOpen = false;
        if (this.activitiesChartPopupInstance) {
            this.activitiesChartPopupInstance.destroy();
            this.activitiesChartPopupInstance = null;
        }
    }

    // NEW: Open specific activity type in embedded view
    async openActivityTypeDetails(activityData) {
        this.closeActivitiesTrendPopup();
        
        if (!this.state.currentUserId) return;
        
        // Build domain to filter by user and activity type
        let domain = [["user_id", "=", this.state.currentUserId]];
        
        if (activityData.typeId) {
            domain.push(["activity_type_id", "=", activityData.typeId]);
        }
        
        const title = `${activityData.label} Activities`;
        
        // Open embedded view with activities
        this.embeddedState.activeSidebarItem = "home";
        await this.loadEmbeddedView("mail.activity", title, domain, "list");
    }

    renderActivitiesChartPopup() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoActivitiesChartPopup");
        if (!canvas || !this.state.activitiesChartData.length) return;

        if (this.activitiesChartPopupInstance) {
            try { this.activitiesChartPopupInstance.destroy(); } catch (e) {}
        }

        try {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            
            // Filter out activities with 0 count for cleaner visualization
            const validData = this.state.activitiesChartData.filter(d => d.count > 0);
            
            if (validData.length === 0) {
                // If no valid data, just return
                return;
            }
            
            this.activitiesChartPopupInstance = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: validData.map(d => d.label || d.name || 'Unknown'),
                    datasets: [{
                        label: "Number of Activities",
                        data: validData.map(d => d.count),
                        backgroundColor: validData.map(d => d.color || '#007bff'),
                        borderColor: validData.map(d => d.color || '#007bff'),
                        borderWidth: 1,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.parsed.y + ' activities';
                                }
                            }
                        }
                    },
                    scales: { 
                        y: { 
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    },
                },
            });
        } catch (error) {
            console.error("Failed to render activities chart in popup:", error);
        }
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

    renderAttendanceChart() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoAttendanceChart");
        if (!canvas || !this.state.attendanceChartData.length) return;

        if (this.attendanceChartInstance) this.attendanceChartInstance.destroy();

        try {
            const ctx = canvas.getContext("2d");
            this.attendanceChartInstance = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: this.state.attendanceChartData.map(d => d.a_month || d.date),
                    datasets: [{
                        label: "Attendance",
                        data: this.state.attendanceChartData.map(d => d.present_days),
                        backgroundColor: "rgba(40, 167, 69, 0.2)",
                        borderColor: "rgba(40, 167, 69, 1)",
                        borderWidth: 2,
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

    // ==================== POPUP METHODS ====================
    
    openPersonalInfoPopup() {
        this.state.personalInfoPopupOpen = true;
    }

    closePersonalInfoPopup() {
        this.state.personalInfoPopupOpen = false;
    }

    openAttendanceTrendPopup() {
        this.state.attendanceTrendPopupOpen = true;
        // Render chart in popup after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.renderAttendanceChartPopup();
        }, 100);
    }

    closeAttendanceTrendPopup() {
        this.state.attendanceTrendPopupOpen = false;
        // Destroy popup chart instance
        if (this.attendanceChartPopupInstance) {
            this.attendanceChartPopupInstance.destroy();
            this.attendanceChartPopupInstance = null;
        }
    }

    openLeaveTrendPopup() {
        this.state.leaveTrendPopupOpen = true;
        // Render chart in popup after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.renderLeaveChartPopup();
        }, 100);
    }

    closeLeaveTrendPopup() {
        this.state.leaveTrendPopupOpen = false;
        // Destroy popup chart instance
        if (this.leaveChartPopupInstance) {
            this.leaveChartPopupInstance.destroy();
            this.leaveChartPopupInstance = null;
        }
    }

    openSkillsPopup() {
        this.state.skillsPopupOpen = true;
    }

    closeSkillsPopup() {
        this.state.skillsPopupOpen = false;
    }

    renderAttendanceChartPopup() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoAttendanceChartPopup");
        if (!canvas || !this.state.attendanceChartData.length) return;

        if (this.attendanceChartPopupInstance) {
            this.attendanceChartPopupInstance.destroy();
        }

        try {
            const ctx = canvas.getContext("2d");
            this.attendanceChartPopupInstance = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: this.state.attendanceChartData.map(d => d.a_month || d.date),
                    datasets: [{
                        label: "Attendance",
                        data: this.state.attendanceChartData.map(d => d.present_days),
                        backgroundColor: "rgba(40, 167, 69, 0.2)",
                        borderColor: "rgba(40, 167, 69, 1)",
                        borderWidth: 2,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: true } },
                    scales: { y: { beginAtZero: true } },
                },
            });
        } catch (error) {
            console.error("Failed to render attendance chart in popup:", error);
        }
    }

    renderLeaveChartPopup() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoLeaveChartPopup");
        if (!canvas || !this.state.leaveChartData.length) return;

        if (this.leaveChartPopupInstance) {
            this.leaveChartPopupInstance.destroy();
        }

        try {
            const ctx = canvas.getContext("2d");
            this.leaveChartPopupInstance = new Chart(ctx, {
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
                    maintainAspectRatio: true,
                    plugins: { legend: { display: true } },
                    scales: { y: { beginAtZero: true } },
                },
            });
        } catch (error) {
            console.error("Failed to render leave chart in popup:", error);
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
            // Load via action XML ID (e.g., Leave dashboard, Task Management)
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
        this.embeddedState.clientActionComponent = null;
        this.embeddedState.clientActionProps = null;
        this.embeddedState.viewTitle = item.title || item.label;
        this.state.currentView = "embedded";
        
        // Clear action stack when starting fresh from sidebar
        this.actionStack = [];
        
        try {
            // Resolve XML ID to numeric action ID
            const actionId = await this.resolveXmlIdToActionId(item.actionXmlId);
            
            if (actionId) {
                console.log("📍 Loading sidebar action:", item.actionXmlId, "->", actionId);
                await this.loadActionById(actionId);
            } else {
                // Fallback to model-based view if action not found
                console.warn("Could not resolve action XML ID:", item.actionXmlId);
                if (item.model) {
                    // Try to find any action for this model
                    const fallbackAction = await this.findActionForModel(item.model, item.title);
                    if (fallbackAction) {
                        await this.loadActionById(fallbackAction.id);
                    } else {
                        this.loadEmbeddedView(item.model, item.title || item.label);
                    }
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

    async openSidebarModel(item) {
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

        // Check if this is an external module that has a known action
        const knownActions = this.getKnownModuleActions();
        if (knownActions[item.model]) {
            const actionKey = item.actionKey || 'default';
            const xmlId = knownActions[item.model][actionKey] || knownActions[item.model]['default'];
            
            if (xmlId) {
                const actionId = await this.resolveXmlIdToActionId(xmlId);
                if (actionId) {
                    console.log("📍 Loading known action for model:", item.model, "->", actionId);
                    this.embeddedState.activeSidebarItem = item.id;
                    await this.loadActionById(actionId);
                    return;
                }
            }
        }

        // Fallback to standard embedded view loading
        this.loadEmbeddedView(item.model, item.title || item.label, domain);
    }
    

    onTabClick(tabId) {
        this.state.activeTab = tabId;
        if (tabId === "activities") setTimeout(() => this.renderLeaveChart(), 300);
        if (tabId === "manager" && this.state.isManager) setTimeout(() => this.renderDeptChart(), 300);
        if (tabId === "employee_applications") {
            this.loadEmployeeApplicationsSummary();
            this.state.employeeApplicationsSummary = [];
        }
        if (tabId === "tasks") {
            this.loadTasksForCurrentUser();
        }
    }

    // Load tasks for the current employee's user_id for the dashboard tab
    async loadTasksForCurrentUser() {
        try {
            let userId = null;
            if (this.state.employee && this.state.employee.user_id) {
                userId = Array.isArray(this.state.employee.user_id)
                    ? this.state.employee.user_id[0]
                    : this.state.employee.user_id;
            } else if (this.state.currentUserId) {
                userId = this.state.currentUserId;
            }
            if (!userId) {
                this.state.tasks = [];
                return;
            }
            const tasks = await this.orm.searchRead(
                "task.management",
                [["user_id", "=", userId]],
                ["id", "name", "user_id", "date_deadline", "stage_id"],
                { limit: 10, order: "date_deadline asc" }
            );
            this.state.tasks = tasks.map(t => ({
                id: t.id,
                name: t.name || '',
                assigned_to: t.user_id ? (Array.isArray(t.user_id) ? t.user_id[1] : t.user_id) : '-',
                deadline: t.date_deadline ? t.date_deadline.split(' ')[0] : '-',
                stage: t.stage_id ? t.stage_id[1] : 'New',
            }));
        } catch (e) {
            this.state.tasks = [];
        }
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

        // Load ALL apps in embedded view (including Settings and Apps)
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
                res_model: "task.management",
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
        // Open Time Log Summary from Task Management (timesheet.report) in Pivot view
        // Filter to only the current user's timesheet records (distinct user)
        let userId = null;
        // Try to get user_id from employee, fallback to currentUserId
        if (this.state.employee && this.state.employee.user_id && Array.isArray(this.state.employee.user_id)) {
            userId = this.state.employee.user_id[0];
        } else if (this.state.currentUserId) {
            userId = this.state.currentUserId;
        }
        const domain = userId ? [["user_id", "=", userId]] : [];
        this.loadEmbeddedView("timesheet.report", "Time Log Summary", domain, "pivot");
    }

    // Replaces Contracts card: now Documents
    async openDocuments() {
        // Open Documents filtered by current employee
        let domain = [];
        if (this.state.employee?.id) {
            domain = [["employee_ref_id", "=", this.state.employee.id]];
        }
        // Try to resolve the action for Documents
        try {
            // Find the menu with name 'Documents'
            const menus = await this.orm.searchRead(
                "ir.ui.menu",
                [["name", "=", "Documents"]],
                ["action"],
                { limit: 1 }
            );
            if (menus && menus.length && menus[0].action) {
                // action is in the form 'ir.actions.act_window,205'
                const actionRef = menus[0].action;
                const actionId = parseInt(actionRef.split(",")[1], 10);
                if (actionId) {
                    // Use loadEmbeddedViewWithMenus to apply domain filter
                    await this.loadEmbeddedViewWithMenus("hr.employee.document", "Documents", domain);
                    return;
                }
            }
            // Fallback: try to resolve by action name/model
            const fallbackId = await this.resolveActionByNameOrModel("Documents", "hr.employee.document");
            if (fallbackId) {
                await this.loadEmbeddedViewWithMenus("hr.employee.document", "Documents", domain);
                return;
            }
            this.notification.add(_t("Could not find the Documents menu action."), { type: "danger" });
        } catch (e) {
            this.notification.add(_t("Error opening Documents menu: ") + e, { type: "danger" });
        }
    }

    // Replaces Broad Factor card: now Announcements
    openAnnouncements() {
        this.loadEmbeddedView("hr.announcement", "Announcements", []);
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