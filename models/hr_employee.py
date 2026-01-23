# -*- coding: utf-8 -*-
from odoo import api, fields, models
from datetime import date, datetime, timedelta
import calendar


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    def attendance_manual(self, next_action=None):
        """
        Manual attendance check-in/check-out method for dashboard
        This method handles toggling between checked_in and checked_out states
        Compatible with Odoo 18 Community Edition
        
        Can be called in two ways:
        1.As instance method: employee.attendance_manual()
        2.As model method with IDs: self.env['hr.employee'].attendance_manual([employee_id])
        """
        # Handle both calling conventions
        if self: 
            # Called as instance method or with browse
            employee = self[0] if len(self) > 0 else False
        else:
            # Called as model method - get current user's employee
            employee = self.env.user.employee_id
        
        if not employee:
            return False
        
        # Perform the attendance action
        if employee.attendance_state == 'checked_out': 
            # Check IN - Create new attendance record
            self.env['hr.attendance'].sudo().create({
                'employee_id': employee.id,
                'check_in': fields.Datetime.now(),
            })
        else:
            # Check OUT - Find the open attendance and close it
            attendance = self.env['hr.attendance'].sudo().search([
                ('employee_id', '=', employee.id),
                ('check_out', '=', False),
            ], limit=1, order='check_in desc')
            
            if attendance:
                attendance.write({
                    'check_out': fields.Datetime.now(),
                })
        
        return employee

    @api.model
    def check_user_group(self):
        """Check if current user is a manager"""
        try:
            return self.env.user.has_group('hr.group_hr_manager') or \
                   self.env.user.has_group('hr_holidays.group_hr_holidays_manager')
        except Exception:
            return False

    @api.model
    def get_user_employee_details(self):
        """Get comprehensive employee details for dashboard"""
        employee = self.env.user.employee_id

        # Return default if no employee found
        if not employee:
            return [{
                'id': False,
                'user_id': self.env.user.id,
                'name': 'User',
                'image_1920': False,
                'image_128': False,
                'job_id': False,
                'department_id': False,
                'company_id': False,
                'work_email': '',
                'mobile_phone': '',
                'work_phone': '',
                'attendance_state': 'checked_out',
                'experience': '-',
                'payslip_count': 0,
                'timesheet_count': 0,
                'documents_count': 0,
                'announcements_count': 0,
                'contracts_count': 0,
                'emp_timesheets': 0,
                'broad_factor': 0,
                'leaves_to_approve': 0,
                'leaves_today': 0,
                'leaves_this_month': 0,
                'leaves_alloc_req': 0,
                'job_applications': 0,
                'attendance_lines': [],
                'leave_lines': [],
                'expense_lines': [],
            }]

        try:
            # Get attendance lines
            attendance_lines = self._get_attendance_lines(employee)
            
            # Get leave lines
            leave_lines = self._get_leave_lines(employee)
            
            # Get expense lines
            expense_lines = self._get_expense_lines(employee)

            # Calculate experience
            experience = self._calculate_experience(employee)

            # Get various counts - UPDATED to use correct models
            payslip_count = self._get_payslip_count(employee)
            timesheet_count = self._get_timesheet_report_count(employee)  # NEW: from timesheet.report
            documents_count = self._get_documents_count(employee)  # NEW: from hr.employee.document
            announcements_count = self._get_announcements_count()  # NEW: from hr.announcement
            emp_timesheets = self._get_timesheet_count(employee)  # Keep for backward compatibility
            
            # Manager specific counts
            leaves_to_approve = self._get_leaves_to_approve()
            leaves_today = self._get_leaves_today()
            leaves_this_month = self._get_leaves_this_month()
            leaves_alloc_req = self._get_allocation_requests()
            job_applications = self._get_job_applications()

            result = [{
                'id': employee.id,
                'user_id': self.env.user.id,
                'name': employee.name or 'User',
                'image_1920': employee.image_1920 or False,
                'image_128': employee.image_128 or False,
                'job_id': [employee.job_id.id, employee.job_id.name] if employee.job_id else False,
                'department_id': [employee.department_id.id, employee.department_id.name] if employee.department_id else False,
                'company_id': [employee.company_id.id, employee.company_id.name] if employee.company_id else False,
                'work_email': employee.work_email or '',
                'mobile_phone': employee.mobile_phone or '',
                'work_phone': employee.work_phone or '',
                'attendance_state': employee.attendance_state or 'checked_out',
                'experience': experience,
                'payslip_count': payslip_count,
                'timesheet_count': timesheet_count,  # NEW: timesheet.report count
                'documents_count': documents_count,  # NEW: hr.employee.document count
                'announcements_count': announcements_count,  # NEW: hr.announcement count
                'emp_timesheets': emp_timesheets,
                'broad_factor': 0,
                'leaves_to_approve': leaves_to_approve,
                'leaves_today': leaves_today,
                'leaves_this_month': leaves_this_month,
                'leaves_alloc_req': leaves_alloc_req,
                'job_applications': job_applications,
                'attendance_lines': attendance_lines,
                'leave_lines': leave_lines,
                'expense_lines': expense_lines,
            }]
            # Debug log for dashboard counts
            _logger = getattr(self, '_logger', None)
            if not _logger:
                import logging
                _logger = logging.getLogger(__name__)
            _logger.info('DASHBOARD COUNTS for user %s: payslip=%s, timesheet=%s, emp_timesheets=%s, documents=%s, announcements=%s',
                self.env.user.login, payslip_count, timesheet_count, emp_timesheets, documents_count, announcements_count)
            return result
        except Exception as e:
            return [{'name': 'User', 'error': str(e)}]

    def _get_attendance_lines(self, employee):
        """Get recent attendance records"""
        try: 
            attendances = self.env['hr.attendance'].sudo().search([
                ('employee_id', '=', employee.id)
            ], order='check_in desc', limit=10)
            
            lines = []
            for att in attendances:
                check_in = fields.Datetime.context_timestamp(self, att.check_in)
                check_out = fields.Datetime.context_timestamp(self, att.check_out) if att.check_out else False
                
                lines.append({
                    'id': att.id,
                    'date': check_in.strftime('%Y-%m-%d'),
                    'sign_in': check_in.strftime('%H:%M'),
                    'sign_out': check_out.strftime('%H:%M') if check_out else '-',
                    'worked_hours': '{:.2f}'.format(att.worked_hours) if att.worked_hours else '0.00',
                })
            return lines
        except Exception: 
            return []

    def _get_leave_lines(self, employee):
        """Get recent leave records"""
        try: 
            leaves = self.env['hr.leave'].sudo().search([
                ('employee_id', '=', employee.id)
            ], order='date_from desc', limit=10)
            
            state_colors = {
                'draft': '#6c757d',
                'confirm': '#ffc107',
                'validate1': '#17a2b8',
                'validate': '#28a745',
                'refuse': '#dc3545',
            }
            
            lines = []
            for leave in leaves: 
                lines.append({
                    'id': leave.id,
                    'request_date_from': leave.request_date_from.strftime('%Y-%m-%d') if leave.request_date_from else '',
                    'request_date_to': leave.request_date_to.strftime('%Y-%m-%d') if leave.request_date_to else '',
                    'type': leave.holiday_status_id.name if leave.holiday_status_id else '',
                    'state': dict(leave._fields['state'].selection).get(leave.state, leave.state),
                    'color': state_colors.get(leave.state, '#6c757d'),
                })
            return lines
        except Exception:
            return []

    def _get_expense_lines(self, employee):
        """Get recent expense records"""
        try: 
            Expense = self.env['hr.expense']
            expenses = Expense.sudo().search([
                ('employee_id', '=', employee.id)
            ], order='date desc', limit=10)
            
            state_colors = {
                'draft': '#6c757d',
                'reported': '#ffc107',
                'approved': '#17a2b8',
                'done': '#28a745',
                'refused': '#dc3545',
            }
            
            lines = []
            for exp in expenses:
                lines.append({
                    'id': exp.id,
                    'date': exp.date.strftime('%Y-%m-%d') if exp.date else '',
                    'name': exp.name or '',
                    'total_amount': '{:.2f}'.format(exp.total_amount) if exp.total_amount else '0.00',
                    'state': dict(exp._fields['state'].selection).get(exp.state, exp.state) if hasattr(exp._fields.get('state', {}), 'selection') else str(exp.state),
                    'color': state_colors.get(exp.state, '#6c757d'),
                })
            return lines
        except Exception: 
            return []

    def _calculate_experience(self, employee):
        """Calculate employee experience"""
        try:
            if not employee.create_date:
                return '-'
            
            start_date = employee.create_date.date()
            today = date.today()
            delta = today - start_date
            
            years = delta.days // 365
            months = (delta.days % 365) // 30
            
            if years > 0:
                return f"{years}y {months}m"
            return f"{months}m"
        except Exception:
            return '-'

    def _get_payslip_count(self, employee):
        """Get payslip count from hr.payslip (hr_payroll_community)"""
        try:
            return self.env['hr.payslip'].sudo().search_count([
                ('employee_id', '=', employee.id)
            ])
        except Exception: 
            return 0

    def _get_timesheet_report_count(self, employee):
        """Get timesheet count from timesheet.report (task_management Time Log Summary)"""
        try:
            # Check if model exists in registry
            if 'timesheet.report' in self.env: 
                return self.env['timesheet.report'].sudo().search_count([
                    ('employee_id', '=', employee.id)
                ])
            return 0
        except Exception as e:
            print(f"Error getting timesheet count: {e}")
            return 0

    def _get_documents_count(self, employee):
        """Get documents count from hr.employee.document, filtered by employee"""
        try:
            if 'hr.employee.document' in self.env:
                return self.env['hr.employee.document'].sudo().search_count([
                    ('employee_id', '=', employee.id)
                ])
            return 0
        except Exception as e:
            print(f"Error getting documents count: {e}")
            return 0

    def _get_announcements_count(self):
        """Get announcements count from hr.announcement (hr_reward_warning), filtered by date and state"""
        try:
            if 'hr.announcement' in self.env:
                today = date.today().strftime('%Y-%m-%d')
                return self.env['hr.announcement'].sudo().search_count([
                    ('state', '=', 'approved'),
                    ('date_start', '<=', today),
                    '|', ('date_end', '>=', today), ('date_end', '=', False)
                ])
            return 0
        except Exception as e:
            print(f"Error getting announcements count: {e}")
            return 0

    def _get_contracts_count(self, employee):
        try:
            return self.env['hr.contract'].sudo().search_count([
                ('employee_id', '=', employee.id)
            ])
        except Exception:
            return 0

    def _get_timesheet_count(self, employee):
        """Legacy method - kept for backward compatibility"""
        try: 
            return self.env['account.analytic.line'].sudo().search_count([
                ('employee_id', '=', employee.id),
                ('project_id', '!=', False)
            ])
        except Exception: 
            return 0

    def _get_leaves_to_approve(self):
        try:
            return self.env['hr.leave'].sudo().search_count([
                ('state', 'in', ['confirm', 'validate1'])
            ])
        except Exception: 
            return 0

    def _get_leaves_today(self):
        try:
            today = date.today()
            return self.env['hr.leave'].sudo().search_count([
                ('date_from', '<=', today),
                ('date_to', '>=', today),
                ('state', '=', 'validate')
            ])
        except Exception:
            return 0

    def _get_leaves_this_month(self):
        try:
            today = date.today()
            first_day = today.replace(day=1)
            last_day = today.replace(day=calendar.monthrange(today.year, today.month)[1])
            
            return self.env['hr.leave'].sudo().search_count([
                ('date_from', '>=', first_day),
                ('date_to', '<=', last_day),
                ('state', '=', 'validate')
            ])
        except Exception: 
            return 0

    def _get_allocation_requests(self):
        try:
            return self.env['hr.leave.allocation'].sudo().search_count([
                ('state', 'in', ['confirm', 'validate1'])
            ])
        except Exception: 
            return 0

    def _get_job_applications(self):
        try:
            return self.env['hr.applicant'].sudo().search_count([])
        except Exception: 
            return 0

    @api.model
    def get_employee_project_tasks(self):
        """Get employee's project tasks"""
        try: 
            tasks = self.env['project.task'].sudo().search([
                '|',
                ('user_ids', 'in', [self.env.user.id]),
                ('user_id', '=', self.env.user.id)
            ], order='date_deadline asc', limit=10)

            return [{
                'id': task.id,
                'task_name': task.name or '',
                'project_name': task.project_id.name if task.project_id else '',
                'date_deadline': task.date_deadline.strftime('%Y-%m-%d') if task.date_deadline else '-',
                'stage_name': task.stage_id.name if task.stage_id else '',
            } for task in tasks]
        except Exception:
            return []

    @api.model
    def get_upcoming(self):
        """Get upcoming birthdays, events, and announcements"""
        result = {'birthday': [], 'event': [], 'announcement': []}
        today = date.today()
        
        # Birthdays
        try:
            employees = self.env['hr.employee'].sudo().search([('birthday', '!=', False)])
            birthdays = []
            for emp in employees:
                bday = emp.birthday
                next_bday = bday.replace(year=today.year)
                if next_bday < today:
                    next_bday = next_bday.replace(year=today.year + 1)
                
                days_until = (next_bday - today).days
                if 0 <= days_until <= 30:
                    birthdays.append({
                        'id': emp.id,
                        'name': emp.name,
                        'birthday': next_bday.strftime('%b %d'),
                        'days_until': days_until,
                    })
            
            birthdays.sort(key=lambda x: x['days_until'])
            result['birthday'] = birthdays[: 5]
        except Exception:
            pass

        # Events
        try: 
            events = self.env['calendar.event'].sudo().search([
                ('start', '>=', today),
                ('start', '<=', today + timedelta(days=30))
            ], order='start asc', limit=5)
            
            result['event'] = [[e.id, e.name, e.start.strftime('%b %d, %H:%M') if e.start else ''] for e in events]
        except Exception:
            pass

        # Announcements
        try: 
            announcements = self.env['hr.announcement'].sudo().search([
                ('state', '=', 'approved'),
                ('date_start', '<=', today),
                '|', ('date_end', '>=', today), ('date_end', '=', False)
            ], order='date_start desc', limit=5)
            
            result['announcement'] = [{'id': a.id, 'announcement_reason': a.name or getattr(a, 'announcement_reason', '')} for a in announcements]
        except Exception:
            pass

        return result

    @api.model
    def employee_attendance_trend(self):
        """Get employee attendance trend for chart"""
        try:
            employee = self.env.user.employee_id
            if not employee: 
                return []

            today = date.today()
            result = []
            
            # Get last 6 months of attendance data
            for i in range(5, -1, -1):
                month_date = today - timedelta(days=i * 30)
                month_name = month_date.strftime('%b')
                
                first_day = month_date.replace(day=1)
                if month_date.month == 12:
                    last_day = month_date.replace(day=31)
                else: 
                    last_day = (first_day + timedelta(days=32)).replace(day=1) - timedelta(days=1)
                
                # Count days with attendance (check_in exists)
                attendances = self.env['hr.attendance'].sudo().search([
                    ('employee_id', '=', employee.id),
                    ('check_in', '>=', first_day.strftime('%Y-%m-%d 00:00:00')),
                    ('check_in', '<=', last_day.strftime('%Y-%m-%d 23:59:59'))
                ])
                
                # Count unique dates
                unique_dates = set()
                for att in attendances:
                    if att.check_in:
                        unique_dates.add(att.check_in.date())
                
                present_days = len(unique_dates)
                
                result.append({'a_month': month_name, 'present_days': present_days})
            
            return result
        except Exception: 
            return []

    @api.model
    def employee_leave_trend(self):
        """Get employee leave trend for chart"""
        try:
            employee = self.env.user.employee_id
            if not employee: 
                return []

            today = date.today()
            result = []
            
            for i in range(5, -1, -1):
                month_date = today - timedelta(days=i * 30)
                month_name = month_date.strftime('%b')
                
                first_day = month_date.replace(day=1)
                if month_date.month == 12:
                    last_day = month_date.replace(day=31)
                else: 
                    last_day = (first_day + timedelta(days=32)).replace(day=1) - timedelta(days=1)
                
                leave_count = self.env['hr.leave'].sudo().search_count([
                    ('employee_id', '=', employee.id),
                    ('date_from', '>=', first_day),
                    ('date_from', '<=', last_day),
                    ('state', '=', 'validate')
                ])
                
                result.append({'l_month': month_name, 'leave': leave_count})
            
            return result
        except Exception: 
            return []

    @api.model
    def get_dept_employee(self):
        """Get department-wise employee distribution"""
        try: 
            departments = self.env['hr.department'].sudo().search([])
            result = []
            
            for dept in departments:
                emp_count = self.env['hr.employee'].sudo().search_count([
                    ('department_id', '=', dept.id)
                ])
                if emp_count > 0:
                    result.append({'label': dept.name, 'value': emp_count})
            
            return result
        except Exception: 
            return []
    
    @api.model
    def get_dashboard_activity_types(self):
        """Return activity type cards with counts for the dashboard."""
        Activity = self.env['mail.activity']
        user_id = self.env.user.id

        # Get all activity types
        atypes = self.env['mail.activity.type'].search([])
        
        # Gather count per activity type for user
        per_type = Activity.sudo().read_group(
            [('user_id', '=', user_id)], 
            ['activity_type_id'], 
            ['activity_type_id']
        )
        count_map = {x['activity_type_id'][0]: x['activity_type_id_count']
                    for x in per_type if x['activity_type_id']}
        
        # Total count
        total_count = Activity.sudo().search_count([('user_id', '=', user_id)])

        # Type icons mapping
        type_icons = {
            'call': '📞',
            'meeting': '📅',
            'email': '✉️',
            'todo': '✅',
            'followup': '🔍',
            'upload': '📎',
        }

        result = []
        for t in atypes:
            type_key = (t.category or t.name or '').lower()
            icon = type_icons.get(type_key, '📋')
            
            # Determine color based on category or name
            if 'call' in type_key:
                color = '#28a745'
            elif 'meet' in type_key:
                color = '#9b59b6'
            elif 'email' in type_key or 'mail' in type_key:
                color = '#1abc9c'
            elif 'todo' in type_key or 'to-do' in type_key or 'to do' in type_key:
                color = '#e74c3c'
            elif 'follow' in type_key:
                color = '#e67e22'
            elif 'upload' in type_key or 'document' in type_key:
                color = '#3498db'
            else:
                color = '#6c757d'
            
            result.append({
                'type_id': t.id,
                'name': t.name,
                'icon': icon,
                'count': count_map.get(t.id, 0),
                'category': t.category or '',
                'color': color,
            })
        
        # Add "All Activities" card at the beginning
        result = [{
            'type_id': False,
            'name': "All Activities",
            'icon': '📋',
            'count': total_count,
            'category': '',
            'color': '#007bff',
        }] + result

        return result
    
    @api.model
    def employee_activities_trend(self):
        """
        Returns user mail.activity trend for the last 6 months, grouped by month.
        X axis: months, Y: activity counts (created/assigned for me)
        """
        user = self.env.user
        today = date.today()
        result = []

        Activity = self.env['mail.activity'].sudo()
        for i in range(5, -1, -1):
            month_date = today - timedelta(days=i * 30)
            first = month_date.replace(day=1)
            if month_date.month == 12:
                last = month_date.replace(day=31)
            else:
                last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)

            # Count activities assigned to this user in this month (by date_deadline)
            count = Activity.search_count([
                ('user_id', '=', user.id),
                ('date_deadline', '>=', first),
                ('date_deadline', '<=', last),
            ])
            result.append({'month': first.strftime('%b'), 'count': count})

        return result