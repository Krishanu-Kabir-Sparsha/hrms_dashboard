/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState, onMounted, onWillStart, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

export class HrDashboard extends Component {
    static template = "hrms_dashboard.Dashboard";
    static props = ["*"];

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.effect = useService("effect");
        
        // Chart refs
        this.leaveChartRef = useRef("leaveChart");
        this.deptChartRef = useRef("deptChart");

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
            await this.loadInitialData();
        });

        onMounted(() => {
            this.initializeTimer();
            this.renderCharts();
        });
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

            // Load chart data
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
        setTimeout(() => {
            this.renderLeaveChart();
            if (this.state.isManager) {
                this.renderDeptChart();
            }
        }, 500);
    }

    renderLeaveChart() {
        const canvas = document.getElementById("zohoLeaveChart");
        if (!canvas || !this.state.leaveChartData.length) return;

        try {
            const ctx = canvas.getContext("2d");
            const data = this.state.leaveChartData;

            new Chart(ctx, {
                type: "line",
                data: {
                    labels: data.map(d => d.l_month),
                    datasets: [{
                        label: "Leaves",
                        data: data.map(d => d.leave),
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
                    plugins: {
                        legend: { display: false },
                    },
                    scales: {
                        y: { beginAtZero: true },
                    },
                },
            });
        } catch (error) {
            console.error("Failed to render leave chart:", error);
        }
    }

    renderDeptChart() {
        const canvas = document.getElementById("zohoDeptChart");
        if (!canvas || !this.state.deptChartData.length) return;

        try {
            const ctx = canvas.getContext("2d");
            const data = this.state.deptChartData;
            const colors = [
                "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", 
                "#9966FF", "#FF9F40", "#00d4aa", "#667eea"
            ];

            new Chart(ctx, {
                type: "doughnut",
                data: {
                    labels: data.map(d => d.label),
                    datasets: [{
                        data: data.map(d => d.value),
                        backgroundColor: colors.slice(0, data.length),
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: "right",
                        },
                    },
                },
            });
        } catch (error) {
            console.error("Failed to render dept chart:", error);
        }
    }

    initializeTimer() {
        if (this.state.employee && this.state.employee.attendance_state === "checked_in") {
            this.state.timerRunning = true;
            this.startTimer();
        }
    }

    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
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
        return `${hours.toString().padStart(2, "0")} : ${minutes.toString().padStart(2, "0")} : ${seconds.toString().padStart(2, "0")}`;
    }

    get filteredApps() {
        if (!this.state.searchQuery) {
            return this.state.apps;
        }
        const query = this.state.searchQuery.toLowerCase();
        return this.state.apps.filter(app => app.name.toLowerCase().includes(query));
    }

    // ==================== MAIN TAB NAVIGATION ====================

    onMainTabClick(tabId) {
        this.state.activeMainTab = tabId;
        if (tabId === "myspace") {
            this.state.currentView = "home";
        } else if (tabId === "team") {
            this.state.currentView = "team";
        } else if (tabId === "organization") {
            this.state.currentView = "organization";
        }
    }

    // ==================== SIDEBAR NAVIGATION ====================

    async onSidebarClick(item) {
        if (item.id === "home") {
            this.state.currentView = "home";
            this.state.activeTab = "activities";
            this.state.activeMainTab = "myspace";
        } else if (item.id === "operations") {
            this.state.currentView = "operations";
        } else if (item.id === "profile") {
            this.state.currentView = "profile";
        } else if (item.id === "leave") {
            await this.openLeaveView();
        } else if (item.id === "attendance") {
            await this.openAttendanceView();
        } else if (item.id === "timesheet") {
            await this.openTimesheetView();
        } else if (item.id === "payroll") {
            await this.openPayrollView();
        } else if (item.id === "expense") {
            await this.openExpenseView();
        }
    }

    onTabClick(tabId) {
        this.state.activeTab = tabId;
        if (tabId === "manager") {
            setTimeout(() => this.renderDeptChart(), 300);
        }
    }

    onSearchInput(event) {
        this.state.searchQuery = event.target.value;
    }

    // ==================== APP ICON HELPER ====================

    getAppIcon(app) {
        if (app.web_icon_data) {
            return "data:image/png;base64," + app.web_icon_data;
        }
        if (app.web_icon) {
            const parts = app.web_icon.split(",");
            if (parts.length === 2) {
                return "/" + parts[0] + "/static/" + parts[1];
            }
        }
        return null;
    }

    // ==================== APP CLICK (WITH SETTINGS FIX) ====================

    async onAppClick(app) {
        if (! app) {
            console.warn("No app provided");
            return;
        }

        try {
            // Special handling for Settings
            if (app.name === "Settings" || app.name.toLowerCase().includes("setting")) {
                await this.actionService.doAction({
                    type: "ir.actions.act_window",
                    name: _t("Settings"),
                    res_model: "res.config.settings",
                    view_mode: "form",
                    views: [[false, "form"]],
                    target: "current",
                    context: { module: "general_settings" },
                });
                return;
            }

            // Special handling for Apps
            if (app.name === "Apps") {
                await this.actionService.doAction({
                    type: "ir.actions.act_window",
                    name: _t("Apps"),
                    res_model: "ir.module.module",
                    view_mode: "kanban,tree,form",
                    views: [[false, "kanban"], [false, "list"], [false, "form"]],
                    target: "current",
                    context: { search_default_filter_installed: 1 },
                });
                return;
            }

            // Normal app handling
            if (app.action_id) {
                await this.actionService.doAction(app.action_id);
            } else if (app.id) {
                const result = await this.orm.call("ir.ui.menu", "get_menu_action", [app.id]);
                if (result && result.action_id) {
                    await this.actionService.doAction(result.action_id);
                } else {
                    // Try to navigate to menu
                    window.location.href = `/web#menu_id=${app.id}`;
                }
            }
        } catch (error) {
            console.error("Failed to open app:", app.name, error);
            this.effect.add({
                message: _t("Could not open ") + app.name,
                type: "warning",
            });
        }
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
                if (this.timerInterval) {
                    clearInterval(this.timerInterval);
                }
                this.effect.add({ message: _t("Successfully Checked Out"), type: "rainbow_man" });
            }

            await this.refreshEmployeeData();
        } catch (error) {
            console.error("Check in/out failed:", error);
            this.effect.add({ message: _t("Check in/out failed"), type: "danger" });
        }
    }

    async refreshEmployeeData() {
        const empDetails = await this.orm.call("hr.employee", "get_user_employee_details", []);
        if (empDetails && empDetails[0]) {
            this.state.employee = empDetails[0];
            this.state.attendance = empDetails[0].attendance_lines || [];
            this.state.leaves = empDetails[0].leave_lines || [];
            this.state.expenses = empDetails[0].expense_lines || [];
        }
    }

    // ==================== VIEW OPENERS ====================

    async openLeaveView() {
        await this.actionService.doAction({
            name: _t("My Leaves"),
            type: "ir.actions.act_window",
            res_model: "hr.leave",
            view_mode: "tree,form,calendar",
            views: [[false, "list"], [false, "form"], [false, "calendar"]],
            domain: [["employee_id", "=", this.state.employee?.id || false]],
            target: "current",
        });
    }

    async openAttendanceView() {
        await this.actionService.doAction({
            name: _t("My Attendance"),
            type: "ir.actions.act_window",
            res_model: "hr.attendance",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["employee_id", "=", this.state.employee?.id || false]],
            target: "current",
        });
    }

    async openTimesheetView() {
        await this.actionService.doAction({
            name: _t("My Timesheets"),
            type: "ir.actions.act_window",
            res_model: "account.analytic.line",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["project_id", "!=", false]],
            target: "current",
        });
    }

    async openPayrollView() {
        await this.actionService.doAction({
            name: _t("My Payslips"),
            type: "ir.actions.act_window",
            res_model: "hr.payslip",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["employee_id", "=", this.state.employee?.id || false]],
            target: "current",
        });
    }

    async openExpenseView() {
        await this.actionService.doAction({
            name: _t("My Expenses"),
            type: "ir.actions.act_window",
            res_model: "hr.expense",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["employee_id", "=", this.state.employee?.id || false]],
            target: "current",
        });
    }

    // ==================== QUICK ACTION BUTTONS ====================

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

    // ==================== STATS CARD CLICKS ====================

    async openPayslips() {
        await this.actionService.doAction({
            name: _t("My Payslips"),
            type: "ir.actions.act_window",
            res_model: "hr.payslip",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["employee_id", "=", this.state.employee?.id || false]],
            target: "current",
        });
    }

    async openTimesheets() {
        await this.actionService.doAction({
            name: _t("My Timesheets"),
            type: "ir.actions.act_window",
            res_model: "account.analytic.line",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["project_id", "!=", false]],
            target: "current",
        });
    }

    async openContracts() {
        await this.actionService.doAction({
            name: _t("My Contracts"),
            type: "ir.actions.act_window",
            res_model: "hr.contract",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["employee_id", "=", this.state.employee?.id || false]],
            target: "current",
        });
    }

    async openLeaveRequests() {
        await this.actionService.doAction({
            name: _t("Leave Requests to Approve"),
            type: "ir.actions.act_window",
            res_model: "hr.leave",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [["state", "in", ["confirm", "validate1"]]],
            target: "current",
        });
    }

    async openLeavesToday() {
        const today = new Date().toISOString().split("T")[0];
        await this.actionService.doAction({
            name: _t("Leaves Today"),
            type: "ir.actions.act_window",
            res_model: "hr.leave",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            domain: [
                ["date_from", "<=", today],
                ["date_to", ">=", today],
                ["state", "=", "validate"],
            ],
            target: "current",
        });
    }

    async openJobApplications() {
        await this.actionService.doAction({
            name: _t("Job Applications"),
            type: "ir.actions.act_window",
            res_model: "hr.applicant",
            view_mode: "kanban,tree,form",
            views: [[false, "kanban"], [false, "list"], [false, "form"]],
            target: "current",
        });
    }

    async openProfile() {
        if (this.state.employee && this.state.employee.id) {
            await this.actionService.doAction({
                name: _t("My Profile"),
                type: "ir.actions.act_window",
                res_model: "hr.employee",
                res_id: this.state.employee.id,
                view_mode: "form",
                views: [[false, "form"]],
                target: "current",
            });
        }
    }

    async openAllAttendance() {
        await this.openAttendanceView();
    }

    async openAllLeaves() {
        await this.openLeaveView();
    }

    async openAllExpenses() {
        await this.openExpenseView();
    }

    async openAllProjects() {
        await this.actionService.doAction({
            name: _t("My Tasks"),
            type: "ir.actions.act_window",
            res_model: "project.task",
            view_mode: "kanban,tree,form",
            views: [[false, "kanban"], [false, "list"], [false, "form"]],
            target: "current",
        });
    }

    // ==================== TEAM VIEW ACTIONS ====================

    async openAllEmployees() {
        await this.actionService.doAction({
            name: _t("Employees"),
            type: "ir.actions.act_window",
            res_model: "hr.employee",
            view_mode: "kanban,tree,form",
            views: [[false, "kanban"], [false, "list"], [false, "form"]],
            target: "current",
        });
    }

    async openDepartments() {
        await this.actionService.doAction({
            name: _t("Departments"),
            type: "ir.actions.act_window",
            res_model: "hr.department",
            view_mode: "tree,form",
            views: [[false, "list"], [false, "form"]],
            target: "current",
        });
    }

    async openOrgChart() {
        await this.actionService.doAction({
            name: _t("Organization Chart"),
            type: "ir.actions.act_window",
            res_model: "hr.employee",
            view_mode: "hierarchy,kanban,tree,form",
            views: [[false, "hierarchy"], [false, "kanban"], [false, "list"], [false, "form"]],
            target: "current",
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
            target: "current",
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
            target: "current",
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
            target: "current",
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
            target: "current",
        });
    }
}

registry.category("actions").add("hr_dashboard", HrDashboard);