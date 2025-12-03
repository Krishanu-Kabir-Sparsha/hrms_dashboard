/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState, onMounted, onWillStart, onWillUnmount, useRef, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { loadJS } from "@web/core/assets";

export class HrDashboard extends Component {
    static template = "hrms_dashboard.Dashboard";
    static props = ["*"];

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.effect = useService("effect");
        this.notification = useService("notification");
        this.viewService = useService("view");
        
        // Reference for embedded view container
        this.embeddedViewRef = useRef("embeddedView");

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
            attendanceCalendar: [],
            // New: Embedded view state
            embeddedApp: null,
            embeddedMenus: [],
            embeddedAction: null,
            embeddedActionXml: null,
            showEmbeddedView: false,
            embeddedBreadcrumb: [],
            embeddedCurrentMenu: null,
        });

        this.sidebarItems = [
            { id: "home", icon: "🏠", label: "Home" },
            { id: "profile", icon: "👤", label: "Profile" },
            { id: "leave", icon: "📅", label: "Leave" },
            { id: "attendance", icon: "⏰", label: "Attendance" },
            { id: "timesheet", icon: "⏱️", label: "Timesheets" },
            { id: "payroll", icon: "💰", label: "Payroll" },
            { id: "expense", icon: "💳", label: "Expenses" },
            { id: "operations", icon: "⚙️", label: "Operations" },
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

        onWillStart(async () => {
            await this.loadChartLibrary();
            await this.loadInitialData();
            await this.loadPhase4Data();
        });

        onMounted(() => {
            this.initializeTimer();
            this.startClockTimer();
            this.startAnnouncementSlider();
            if (this.state.chartLoaded) {
                this.renderCharts();
            }
        });

        onWillUnmount(() => {
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.clockInterval) clearInterval(this.clockInterval);
            if (this.announcementInterval) clearInterval(this.announcementInterval);
            this.destroyEmbeddedView();
        });
    }

    // ==================== EMBEDDED VIEW METHODS ====================

    async openAppEmbedded(app) {
        if (!app) return;

        this.state.loading = true;
        
        try {
            // Get menu structure for this app
            const menuData = await this.orm.call("ir.ui.menu", "get_menu_with_all_children", [app.id]);
            
            this.state.embeddedApp = app;
            this.state.embeddedMenus = menuData?.children || [];
            this.state.showEmbeddedView = true;
            this.state.currentView = "embedded";
            this.state.embeddedBreadcrumb = [{ id: app.id, name: app.name }];

            // Load first action if available
            if (menuData?.action_id) {
                await this.loadEmbeddedAction(menuData.action_id, app.name);
            } else if (this.state.embeddedMenus.length > 0) {
                // Find first menu with action
                const firstMenuWithAction = this.findFirstMenuWithAction(this.state.embeddedMenus);
                if (firstMenuWithAction) {
                    await this.onEmbeddedMenuClick(firstMenuWithAction);
                }
            }
        } catch (error) {
            console.error("Failed to open embedded app:", error);
            this.notification.add(_t("Failed to open ") + app.name, { type: "warning" });
        } finally {
            this.state.loading = false;
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

    async onEmbeddedMenuClick(menu) {
        if (! menu) return;

        this.state.embeddedCurrentMenu = menu;

        // Update breadcrumb
        const appBreadcrumb = this.state.embeddedBreadcrumb[0];
        this.state.embeddedBreadcrumb = [appBreadcrumb, { id: menu.id, name: menu.name }];

        if (menu.action_id) {
            await this.loadEmbeddedAction(menu.action_id, menu.name);
        } else if (menu.children?.length) {
            // Show submenu
            this.state.embeddedMenus = menu.children;
        }
    }

    async loadEmbeddedAction(actionId, title) {
        try {
            // Get action details
            const actionData = await this.orm.call("ir.actions.act_window", "read", [[actionId], [
                "name", "res_model", "view_mode", "views", "domain", "context", "target", "search_view_id"
            ]]);

            if (! actionData || !actionData[0]) {
                throw new Error("Action not found");
            }

            const action = actionData[0];
            
            this.state.embeddedAction = {
                id: actionId,
                name: action.name || title,
                res_model: action.res_model,
                view_mode: action.view_mode,
                views: action.views,
                domain: action.domain || [],
                context: action.context || {},
                search_view_id: action.search_view_id,
            };

            // Render the embedded view
            await this.renderEmbeddedView();
        } catch (error) {
            console.error("Failed to load embedded action:", error);
        }
    }

    async renderEmbeddedView() {
        const container = this.embeddedViewRef.el;
        if (!container || !this.state.embeddedAction) return;

        // Clear previous content
        container.innerHTML = '';

        const action = this.state.embeddedAction;
        
        // Determine view type
        const viewModes = action.view_mode.split(',');
        const primaryView = viewModes[0].trim();

        // Create action config for Odoo's action manager
        const actionConfig = {
            type: "ir.actions.act_window",
            name: action.name,
            res_model: action.res_model,
            view_mode: action.view_mode,
            views: action.views || [[false, primaryView]],
            domain: action.domain,
            context: { ...action.context, embedded: true },
            target: "inline",
        };

        try {
            // Use action service to render in container
            await this.actionService.doAction(actionConfig, {
                clearBreadcrumbs: false,
                onClose: () => {
                    // Handle view close
                },
                additionalContext: {
                    embedded_dashboard: true,
                },
            });
        } catch (error) {
            console.error("Failed to render embedded view:", error);
            // Fallback: Show iframe
            this.renderIframeView(action);
        }
    }

    renderIframeView(action) {
        const container = this.embeddedViewRef.el;
        if (!container) return;

        container.innerHTML = '';

        const iframe = document.createElement('iframe');
        iframe.className = 'zoho_embedded_iframe';
        iframe.src = `/web#action=${action.id}&model=${action.res_model}&view_type=list`;
        iframe.style.cssText = 'width:100%;height:100%;border:none;';
        
        container.appendChild(iframe);
    }

    destroyEmbeddedView() {
        const container = this.embeddedViewRef?.el;
        if (container) {
            container.innerHTML = '';
        }
    }

    closeEmbeddedView() {
        this.destroyEmbeddedView();
        this.state.showEmbeddedView = false;
        this.state.embeddedApp = null;
        this.state.embeddedMenus = [];
        this.state.embeddedAction = null;
        this.state.embeddedBreadcrumb = [];
        this.state.currentView = "operations";
    }

    async onBreadcrumbClick(crumb, index) {
        if (index === 0) {
            // Clicked on app - reload app menus
            await this.openAppEmbedded(this.state.embeddedApp);
        }
    }

    // ==================== QUICK EMBEDDED VIEWS ====================

    async openEmbeddedLeave() {
        await this.openQuickEmbedded("hr.leave", "My Leaves", 
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    async openEmbeddedAttendance() {
        await this.openQuickEmbedded("hr.attendance", "My Attendance",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    async openEmbeddedTimesheets() {
        await this.openQuickEmbedded("account.analytic.line", "My Timesheets",
            [["project_id", "!=", false]]);
    }

    async openEmbeddedPayroll() {
        await this.openQuickEmbedded("hr.payslip", "My Payslips",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    async openEmbeddedExpenses() {
        await this.openQuickEmbedded("hr.expense", "My Expenses",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    async openQuickEmbedded(resModel, title, domain = []) {
        this.state.embeddedApp = { name: title };
        this.state.showEmbeddedView = true;
        this.state.currentView = "embedded";
        this.state.embeddedBreadcrumb = [{ name: title }];
        this.state.embeddedMenus = [];

        this.state.embeddedAction = {
            name: title,
            res_model: resModel,
            view_mode: "list,form",
            views: [[false, "list"], [false, "form"]],
            domain: domain,
            context: {},
        };

        await this.renderEmbeddedView();
    }

    // ==================== PHASE 4: DATA LOADERS ====================

    async loadPhase4Data() {
        await Promise.all([
            this.loadLeaveBalances(),
            this.loadTeamMembers(),
            this.loadSkills(),
            this.loadAttendanceCalendar(),
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
                type: a.holiday_status_id[1],
                allocated: a.number_of_days,
                taken: a.leaves_taken || 0,
                remaining: a.number_of_days - (a.leaves_taken || 0),
            }));
        } catch (error) {
            console.error("Failed to load leave balances:", error);
        }
    }

    async loadTeamMembers() {
        try {
            if (! this.state.employee?.department_id) return;

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
                name: s.skill_id[1],
                type: s.skill_type_id[1],
                progress: s.level_progress,
            }));
        } catch (error) {
            console.error("Failed to load skills:", error);
        }
    }

    async loadAttendanceCalendar() {
        try {
            if (!this.state.employee?.id) return;

            const today = new Date();
            const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

            const attendances = await this.orm.searchRead(
                "hr.attendance",
                [
                    ["employee_id", "=", this.state.employee.id],
                    ["check_in", ">=", thirtyDaysAgo.toISOString()],
                ],
                ["check_in", "check_out", "worked_hours"],
                { order: "check_in desc" }
            );

            this.state.attendanceCalendar = attendances.map(a => ({
                date: a.check_in.split("T")[0],
                hours: a.worked_hours || 0,
                hasCheckout: !!a.check_out,
            }));
        } catch (error) {
            console.error("Failed to load attendance calendar:", error);
        }
    }

    // ==================== CLOCK & TIMERS ====================

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

    // ==================== CHART & DATA LOADING ====================

    async loadChartLibrary() {
        try {
            if (typeof Chart === "undefined") {
                await loadJS("https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js");
            }
            this.state.chartLoaded = true;
        } catch (error) {
            console.warn("Chart.js could not be loaded.", error);
            this.state.chartLoaded = false;
        }
    }

    async loadInitialData() {
        try {
            this.state.isManager = await this.orm.call("hr.employee", "check_user_group", []);

            const empDetails = await this.orm.call("hr.employee", "get_user_employee_details", []);
            if (empDetails && empDetails[0]) {
                this.state.employee = empDetails[0];
                this.state.attendance = empDetails[0].attendance_lines || [];
                this.state.leaves = empDetails[0].leave_lines || [];
                this.state.expenses = empDetails[0].expense_lines || [];
            }

            const projects = await this.orm.call("hr.employee", "get_employee_project_tasks", []);
            this.state.projects = projects || [];

            const upcoming = await this.orm.call("hr.employee", "get_upcoming", []);
            if (upcoming) {
                this.state.birthdays = upcoming.birthday || [];
                this.state.events = upcoming.event || [];
                this.state.announcements = upcoming.announcement || [];
            }

            await this.loadChartData();

            if (this.state.isManager) {
                this.contentTabs.push({ id: "manager", label: "Manager View" });
            }

            await this.loadApps();
        } catch (error) {
            console.error("Failed to load data:", error);
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

    get filteredApps() {
        if (!this.state.searchQuery) return this.state.apps;
        const query = this.state.searchQuery.toLowerCase();
        return this.state.apps.filter(app => app.name.toLowerCase().includes(query));
    }

    // ==================== NAVIGATION ====================

    onMainTabClick(tabId) {
        this.state.activeMainTab = tabId;
        if (tabId === "myspace") this.state.currentView = "home";
        else if (tabId === "team") this.state.currentView = "team";
        else if (tabId === "organization") this.state.currentView = "organization";
    }

    async onSidebarClick(item) {
        // Close embedded view when switching sidebar
        if (this.state.showEmbeddedView) {
            this.closeEmbeddedView();
        }

        if (item.id === "home") {
            this.state.currentView = "home";
            this.state.activeTab = "activities";
            this.state.activeMainTab = "myspace";
            setTimeout(() => this.renderCharts(), 300);
        } else if (item.id === "operations") {
            this.state.currentView = "operations";
        } else if (item.id === "profile") {
            this.state.currentView = "profile";
        } else if (item.id === "leave") {
            await this.openEmbeddedLeave();
        } else if (item.id === "attendance") {
            await this.openEmbeddedAttendance();
        } else if (item.id === "timesheet") {
            await this.openEmbeddedTimesheets();
        } else if (item.id === "payroll") {
            await this.openEmbeddedPayroll();
        } else if (item.id === "expense") {
            await this.openEmbeddedExpenses();
        }
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

    // ==================== APP CLICK - EMBEDDED ====================

    async onAppClick(app) {
        if (! app) return;
        const appName = app.name ?  app.name.toLowerCase() : "";

        // Special handling for Settings - still use external
        if (appName.includes("setting")) {
            window.location.href = `/web#menu_id=${app.id}`;
            return;
        }

        // Special handling for Apps module - still use external
        if (appName === "apps") {
            window.location.href = `/web#menu_id=${app.id}`;
            return;
        }

        // Open embedded for all other apps
        await this.openAppEmbedded(app);
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
                this.effect.add({ message: _t("Successfully Checked In"), type: "rainbow_man" });
            } else {
                this.state.employee.attendance_state = "checked_out";
                this.state.timerRunning = false;
                if (this.timerInterval) clearInterval(this.timerInterval);
                this.effect.add({ message: _t("Successfully Checked Out"), type: "rainbow_man" });
            }

            await this.refreshEmployeeData();
        } catch (error) {
            console.error("Check in/out failed:", error);
            this.notification.add(_t("Check in/out failed"), { type: "danger" });
        }
    }

    async refreshEmployeeData() {
        const empDetails = await this.orm.call("hr.employee", "get_user_employee_details", []);
        if (empDetails?.[0]) {
            this.state.employee = empDetails[0];
            this.state.attendance = empDetails[0].attendance_lines || [];
            this.state.leaves = empDetails[0].leave_lines || [];
            this.state.expenses = empDetails[0].expense_lines || [];
        }
    }

    // ==================== QUICK ACTIONS ====================

    async addAttendance() {
        await this.actionService.doAction({
            name: _t("New Attendance"), type: "ir.actions.act_window",
            res_model: "hr.attendance", view_mode: "form",
            views: [[false, "form"]], target: "new",
            context: { default_employee_id: this.state.employee?.id },
        });
    }

    async addLeave() {
        await this.actionService.doAction({
            name: _t("New Leave Request"), type: "ir.actions.act_window",
            res_model: "hr.leave", view_mode: "form",
            views: [[false, "form"]], target: "new",
            context: { default_employee_id: this.state.employee?.id },
        });
    }

    async addExpense() {
        await this.actionService.doAction({
            name: _t("New Expense"), type: "ir.actions.act_window",
            res_model: "hr.expense", view_mode: "form",
            views: [[false, "form"]], target: "new",
            context: { default_employee_id: this.state.employee?.id },
        });
    }

    async addProject() {
        await this.actionService.doAction({
            name: _t("New Task"), type: "ir.actions.act_window",
            res_model: "project.task", view_mode: "form",
            views: [[false, "form"]], target: "new",
        });
    }

    // ==================== STATS CLICKS ====================

    async openPayslips() { await this.openEmbeddedPayroll(); }
    async openTimesheets() { await this.openEmbeddedTimesheets(); }
    
    async openContracts() {
        await this.openQuickEmbedded("hr.contract", "My Contracts",
            [["employee_id", "=", this.state.employee?.id || false]]);
    }

    async openLeaveRequests() {
        await this.openQuickEmbedded("hr.leave", "Leave Requests to Approve",
            [["state", "in", ["confirm", "validate1"]]]);
    }

    async openLeavesToday() {
        const today = new Date().toISOString().split("T")[0];
        await this.openQuickEmbedded("hr.leave", "Leaves Today",
            [["date_from", "<=", today], ["date_to", ">=", today], ["state", "=", "validate"]]);
    }

    async openJobApplications() {
        await this.openQuickEmbedded("hr.applicant", "Job Applications", []);
    }

    async openProfile() {
        if (this.state.employee?.id) {
            await this.actionService.doAction({
                name: _t("My Profile"), type: "ir.actions.act_window",
                res_model: "hr.employee", res_id: this.state.employee.id,
                view_mode: "form", views: [[false, "form"]], target: "new",
            });
        }
    }

    async openAllAttendance() { await this.openEmbeddedAttendance(); }
    async openAllLeaves() { await this.openEmbeddedLeave(); }
    async openAllExpenses() { await this.openEmbeddedExpenses(); }
    
    async openAllProjects() {
        await this.openQuickEmbedded("project.task", "My Tasks", []);
    }

    async openAllEmployees() {
        await this.openQuickEmbedded("hr.employee", "Employees", []);
    }

    async openDepartments() {
        await this.openQuickEmbedded("hr.department", "Departments", []);
    }

    async openOrgChart() {
        await this.openQuickEmbedded("hr.employee", "Organization", []);
    }

    async openTeamMember(member) {
        await this.actionService.doAction({
            name: member.name, type: "ir.actions.act_window",
            res_model: "hr.employee", res_id: member.id,
            view_mode: "form", views: [[false, "form"]], target: "new",
        });
    }

    // ==================== TABLE ROW CLICKS ====================

    async onAttendanceRowClick(att) {
        await this.actionService.doAction({
            name: _t("Attendance"), type: "ir.actions.act_window",
            res_model: "hr.attendance", res_id: att.id,
            view_mode: "form", views: [[false, "form"]], target: "new",
        });
    }

    async onLeaveRowClick(leave) {
        await this.actionService.doAction({
            name: _t("Leave Request"), type: "ir.actions.act_window",
            res_model: "hr.leave", res_id: leave.id,
            view_mode: "form", views: [[false, "form"]], target: "new",
        });
    }

    async onExpenseRowClick(exp) {
        await this.actionService.doAction({
            name: _t("Expense"), type: "ir.actions.act_window",
            res_model: "hr.expense", res_id: exp.id,
            view_mode: "form", views: [[false, "form"]], target: "new",
        });
    }

    async onProjectRowClick(proj) {
        await this.actionService.doAction({
            name: _t("Task"), type: "ir.actions.act_window",
            res_model: "project.task", res_id: proj.id,
            view_mode: "form", views: [[false, "form"]], target: "new",
        });
    }
}

registry.category("actions").add("hr_dashboard", HrDashboard);