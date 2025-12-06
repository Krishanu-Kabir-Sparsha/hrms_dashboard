/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState, onMounted, onWillStart, onWillUnmount, useRef, useChildSubEnv } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { loadJS } from "@web/core/assets";

export class ZohoDashboard extends Component {
    static template = "hrms_dashboard.ZohoDashboard";
    static props = ["*"];

    setup() {
        // Core Services - Only use services that are available
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");

        // Refs
        this.embeddedContainerRef = useRef("embeddedContainer");

        // Embedded State
        this.embeddedState = useState({
            isEmbeddedMode: false,
            currentApp: null,
            currentMenus: [],
            breadcrumbs: [],
            loading: false,
            currentActionId: null,
            viewTitle: "",
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
            await this.loadChartLibrary();
            await this.loadInitialData();
            await this.loadPhase4Data();
        });

        onMounted(() => {
            this.initializeTimer();
            this.startClockTimer();
            this.startAnnouncementSlider();
            this.hideOdooNavbar();
            if (this.state.chartLoaded) {
                this.renderCharts();
            }
        });

        onWillUnmount(() => {
            this.cleanup();
        });
    }

    // ==================== UTILITY METHODS ====================

    cleanup() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.clockInterval) clearInterval(this.clockInterval);
        if (this.announcementInterval) clearInterval(this.announcementInterval);
        this.showOdooNavbar();
    }

    hideOdooNavbar() {
        const navbar = document.querySelector('.o_main_navbar');
        if (navbar) navbar.style.display = 'none';

        const actionManager = document.querySelector('.o_action_manager');
        if (actionManager) actionManager.style.paddingTop = '0';
    }

    showOdooNavbar() {
        const navbar = document.querySelector('.o_main_navbar');
        if (navbar) navbar.style.display = '';
    }

    // ==================== EMBEDDED VIEW METHODS ====================

    async openEmbeddedView(resModel, title, domain = [], viewType = "list", context = {}) {
        this.embeddedState.loading = true;
        this.embeddedState.isEmbeddedMode = true;
        this.embeddedState.currentApp = { name: title };
        this.embeddedState.breadcrumbs = [{ name: title, type: 'model' }];
        this.embeddedState.viewTitle = title;
        this.state.currentView = "embedded";

        try {
            // Create action configuration
            const action = {
                type: "ir.actions.act_window",
                name: title,
                res_model: resModel,
                view_mode: `${viewType},form`,
                views: [[false, viewType], [false, "form"]],
                domain: domain,
                context: context,
                target: "inline",
            };

            // Store for reference
            this.embeddedState.currentAction = action;

            // Wait for DOM to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            // Render the action in our container
            await this.renderEmbeddedAction(action);

        } catch (error) {
            console.error("Failed to open embedded view:", error);
            this.notification.add(_t("Failed to open view"), { type: "warning" });
        } finally {
            this.embeddedState.loading = false;
        }
    }

    async renderEmbeddedAction(action) {
        const container = this.embeddedContainerRef.el;
        if (!container) return;

        // Clear container
        container.innerHTML = '';

        try {
            // Use doAction with inline target to render in our container
            await this.actionService.doAction(action, {
                clearBreadcrumbs: true,
                onClose: () => {
                    this.closeEmbeddedView();
                },
            });
        } catch (error) {
            console.error("Failed to render action:", error);
        }
    }

    async openEmbeddedApp(app) {
        if (! app) return;

        this.embeddedState.loading = true;

        try {
            // Get menu structure
            const menuData = await this.orm.call("ir.ui.menu", "get_menu_with_all_children", [app.id]);

            this.embeddedState.isEmbeddedMode = true;
            this.embeddedState.currentApp = app;
            this.embeddedState.currentMenus = menuData?.children || [];
            this.embeddedState.breadcrumbs = [{ id: app.id, name: app.name, type: 'app' }];
            this.embeddedState.viewTitle = app.name;
            this.state.currentView = "embedded";

            // Find first action
            let actionId = menuData?.action_id;
            if (!actionId && menuData?.children?.length) {
                const firstMenu = this.findFirstMenuWithAction(menuData.children);
                if (firstMenu) {
                    actionId = firstMenu.action_id;
                    this.embeddedState.breadcrumbs.push({
                        id: firstMenu.id,
                        name: firstMenu.name,
                        type: 'menu'
                    });
                }
            }

            if (actionId) {
                await this.executeEmbeddedAction(actionId);
            }

        } catch (error) {
            console.error("Failed to open app:", error);
            this.notification.add(_t("Failed to open ") + app.name, { type: "warning" });
        } finally {
            this.embeddedState.loading = false;
        }
    }

    async executeEmbeddedAction(actionId) {
        try {
            await this.actionService.doAction(actionId, {
                clearBreadcrumbs: true,
            });
        } catch (error) {
            console.error("Failed to execute action:", error);
        }
    }

    async onEmbeddedMenuClick(menu) {
        if (! menu) return;

        this.embeddedState.loading = true;

        try {
            // Update breadcrumbs
            const appCrumb = this.embeddedState.breadcrumbs[0];
            this.embeddedState.breadcrumbs = [
                appCrumb,
                { id: menu.id, name: menu.name, type: 'menu' }
            ];

            if (menu.action_id) {
                await this.executeEmbeddedAction(menu.action_id);
            } else if (menu.children?.length) {
                const firstChild = this.findFirstMenuWithAction(menu.children);
                if (firstChild) {
                    await this.executeEmbeddedAction(firstChild.action_id);
                }
            }
        } catch (error) {
            console.error("Failed to load menu:", error);
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
        this.embeddedState.isEmbeddedMode = false;
        this.embeddedState.currentApp = null;
        this.embeddedState.currentMenus = [];
        this.embeddedState.breadcrumbs = [];
        this.embeddedState.viewTitle = "";
        this.state.currentView = "operations";

        // Restore to dashboard
        this.actionService.doAction("hrms_dashboard.dashboard_action_spa", {
            clearBreadcrumbs: true,
        });
    }

    returnToDashboardHome() {
        this.embeddedState.isEmbeddedMode = false;
        this.embeddedState.currentApp = null;
        this.embeddedState.currentMenus = [];
        this.embeddedState.breadcrumbs = [];
        this.state.currentView = "home";
        this.state.activeMainTab = "myspace";

        // Restore to dashboard
        this.actionService.doAction("hrms_dashboard.dashboard_action_spa", {
            clearBreadcrumbs: true,
        });
    }

    onBreadcrumbClick(crumb, index) {
        if (index === 0) {
            if (crumb.type === 'app') {
                this.openEmbeddedApp(this.embeddedState.currentApp);
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
            if (! this.state.employee?.id) return;

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
            console.error("Failed to load leave balances:", error);
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
            console.error("Failed to load team members:", error);
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
                type: s.skill_type_id ?  s.skill_type_id[1] : '',
                progress: s.level_progress || 0,
            }));
        } catch (error) {
            console.error("Failed to load skills:", error);
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
            console.warn("Chart.js could not be loaded:", error);
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
            console.error("Failed to load apps:", error);
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
            console.error("Failed to render leave chart:", error);
        }
    }

    renderDeptChart() {
        if (typeof Chart === "undefined") return;
        const canvas = document.getElementById("zohoDeptChart");
        if (!canvas || !this.state.deptChartData.length) return;

        if (this.deptChartInstance) this.deptChartInstance.destroy();

        try {
            const ctx = canvas.getContext("2d");
            const colors = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40", "#00d4aa", "#667eea"];

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
            console.error("Failed to render dept chart:", error);
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
            this.returnToDashboardHome();
            return;
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
        if (this.embeddedState.isEmbeddedMode && item.action) {
            this.embeddedState.isEmbeddedMode = false;
            this.embeddedState.currentApp = null;
            this.embeddedState.currentMenus = [];
            this.embeddedState.breadcrumbs = [];
        }

        if (item.action === "home") {
            this.returnToDashboardHome();
        } else if (item.action === "operations") {
            if (this.embeddedState.isEmbeddedMode) {
                this.returnToDashboardHome();
            }
            this.state.currentView = "operations";
            this.state.activeMainTab = "myspace";
        } else if (item.action === "profile") {
            this.state.currentView = "profile";
        } else if (item.model) {
            this.openSidebarModel(item);
        }
    }

    openSidebarModel(item) {
        let domain = [];
        if (this.state.employee?.id) {
            if (["hr.leave", "hr.attendance", "hr.payslip", "hr.expense"].includes(item.model)) {
                domain = [["employee_id", "=", this.state.employee.id]];
            } else if (item.model === "account.analytic.line") {
                domain = [["project_id", "!=", false]];
            }
        }
        this.openEmbeddedView(item.model, item.title || item.label, domain);
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

        const appName = app.name?.toLowerCase() || "";

        // Special apps that need full page navigation
        if (appName.includes("setting") || appName === "apps" || appName.includes("discuss")) {
            window.location.href = `/web#menu_id=${app.id}`;
            return;
        }

        // Open in embedded view
        await this.openEmbeddedApp(app);
    }

    // ==================== CHECK IN/OUT ====================

    async onCheckInOut() {
        try {
            await this.orm.call("hr.employee", "attendance_manual", [[]]);

            if (this.state.employee.attendance_state === "checked_out") {
                this.state.employee.attendance_state = "checked_in";
                this.state.timerRunning = true;
                this.state.timerSeconds = 0;
                this.startTimer();
                this.notification.add(_t("Successfully Checked In"), { type: "success" });
            } else {
                this.state.employee.attendance_state = "checked_out";
                this.state.timerRunning = false;
                if (this.timerInterval) clearInterval(this.timerInterval);
                this.notification.add(_t("Successfully Checked Out"), { type: "success" });
            }

            await this.refreshEmployeeData();
        } catch (error) {
            console.error("Check in/out failed:", error);
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
            console.error("Failed to refresh employee data:", e);
        }
    }

    // ==================== QUICK ACTIONS (MODAL) ====================

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

    // ==================== STATS CLICKS ====================

    openPayslips() {
        this.openEmbeddedView("hr.payslip", "My Payslips",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    openTimesheets() {
        this.openEmbeddedView("account.analytic.line", "My Timesheets",
            [["project_id", "!=", false]]);
    }

    openContracts() {
        this.openEmbeddedView("hr.contract", "My Contracts",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    openLeaveRequests() {
        this.openEmbeddedView("hr.leave", "Leave Requests",
            [["state", "in", ["confirm", "validate1"]]]);
    }

    openLeavesToday() {
        const today = new Date().toISOString().split("T")[0];
        this.openEmbeddedView("hr.leave", "Leaves Today",
            [["date_from", "<=", today], ["date_to", ">=", today], ["state", "=", "validate"]]);
    }

    openJobApplications() {
        this.openEmbeddedView("hr.applicant", "Job Applications", [], "kanban");
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
        this.openEmbeddedView("hr.attendance", "My Attendance",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    openAllLeaves() {
        this.openEmbeddedView("hr.leave", "My Leaves",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    openAllExpenses() {
        this.openEmbeddedView("hr.expense", "My Expenses",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    openAllProjects() {
        this.openEmbeddedView("project.task", "My Tasks", [], "kanban");
    }

    openAllEmployees() {
        this.openEmbeddedView("hr.employee", "Employees", [], "kanban");
    }

    openDepartments() {
        this.openEmbeddedView("hr.department", "Departments", []);
    }

    openOrgChart() {
        this.openEmbeddedView("hr.employee", "Organization", [], "kanban");
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

    // ==================== TABLE ROW CLICKS ====================

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