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
                'employee_id':  employee.id,
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
        if not employee:
            return [{}]

        try:
            # Get attendance lines
            attendance_lines = self._get_attendance_lines(employee)
            
            # Get leave lines
            leave_lines = self._get_leave_lines(employee)
            
            # Get expense lines
            expense_lines = self._get_expense_lines(employee)

            # Calculate experience
            experience = self._calculate_experience(employee)

            # Get various counts
            payslip_count = self._get_payslip_count(employee)
            contracts_count = self._get_contracts_count(employee)
            emp_timesheets = self._get_timesheet_count(employee)
            
            # Manager specific counts
            leaves_to_approve = self._get_leaves_to_approve()
            leaves_today = self._get_leaves_today()
            leaves_this_month = self._get_leaves_this_month()
            leaves_alloc_req = self._get_allocation_requests()
            job_applications = self._get_job_applications()

            return [{
                'id': employee.id,
                'name': employee.name or 'User',
                'image_1920': employee.image_1920 or False,
                'image_128': employee.image_128 or False,
                'job_id': [employee.job_id.id, employee.job_id.name] if employee.job_id else False,
                'department_id':  [employee.department_id.id, employee.department_id.name] if employee.department_id else False,
                'work_email':  employee.work_email or '',
                'mobile_phone': employee.mobile_phone or '',
                'work_phone': employee.work_phone or '',
                'attendance_state': employee.attendance_state or 'checked_out',
                'experience': experience,
                'payslip_count': payslip_count,
                'contracts_count': contracts_count,
                'emp_timesheets': emp_timesheets,
                'broad_factor': 0,
                'leaves_to_approve': leaves_to_approve,
                'leaves_today':  leaves_today,
                'leaves_this_month': leaves_this_month,
                'leaves_alloc_req': leaves_alloc_req,
                'job_applications': job_applications,
                'attendance_lines': attendance_lines,
                'leave_lines':  leave_lines,
                'expense_lines': expense_lines,
            }]
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
                'validate':  '#28a745',
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
                'approved':  '#17a2b8',
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
        try:
            return self.env['hr.payslip'].sudo().search_count([
                ('employee_id', '=', employee.id)
            ])
        except Exception: 
            return 0

    def _get_contracts_count(self, employee):
        try:
            return self.env['hr.contract'].sudo().search_count([
                ('employee_id', '=', employee.id)
            ])
        except Exception:
            return 0

    def _get_timesheet_count(self, employee):
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
                
                result.append({'l_month': month_name, 'leave':  leave_count})
            
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