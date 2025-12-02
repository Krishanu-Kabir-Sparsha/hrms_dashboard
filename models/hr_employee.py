# -*- coding: utf-8 -*-
from datetime import timedelta, datetime, date
from dateutil.relativedelta import relativedelta
from odoo import api, fields, models, _
from odoo.http import request
from odoo.tools import format_duration


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    birthday = fields.Date(
        string='Date of Birth',
        groups="base.group_user",
        help="Birthday of employee"
    )

    def attendance_manual(self):
        """Create and update an attendance for the user employee"""
        employee = self.env['hr.employee'].sudo().search([
            ('user_id', '=', self.env.user.id)
        ], limit=1)
        
        if employee:
            employee.sudo()._attendance_action_change({
                'city': 'Unknown',
                'country_name': 'Unknown',
                'latitude': False,
                'longitude': False,
                'ip_address': False,
                'browser': False,
                'mode': 'kiosk'
            })
        return employee

    @api.model
    def check_user_group(self):
        """Check if the user is an HR manager"""
        return self.env.user.has_group('hr.group_hr_manager')

    @api.model
    def get_user_employee_details(self):
        """Fetch the details of employee"""
        uid = self.env.user.id
        employee = self.env['hr.employee'].sudo().search_read(
            [('user_id', '=', uid)], limit=1
        )
        
        if not employee:
            return False
            
        employee = employee[0]
        
        # Attendance lines
        attendance = self.env['hr.attendance'].sudo().search_read(
            [('employee_id', '=', employee['id'])],
            fields=['id', 'check_in', 'check_out', 'worked_hours'],
            order='check_in desc',
            limit=20
        )
        
        attendance_lines = []
        for line in attendance:
            if line['check_in']:
                attendance_lines.append({
                    'id': line['id'],
                    'date': line['check_in'].strftime('%Y-%m-%d'),
                    'sign_in': line['check_in'].strftime('%H:%M'),
                    'sign_out': line['check_out'].strftime('%H:%M') if line['check_out'] else '',
                    'worked_hours': format_duration(line['worked_hours']) if line['worked_hours'] else '00:00'
                })
        
        # Leave lines
        leaves = self.env['hr.leave'].sudo().search_read(
            [('employee_id', '=', employee['id'])],
            fields=['id', 'request_date_from', 'request_date_to', 'state', 'holiday_status_id'],
            order='create_date desc',
            limit=20
        )
        
        leave_lines = []
        for line in leaves:
            state_map = {
                'confirm': ('To Approve', 'orange'),
                'validate1': ('Second Approval', '#7CFC00'),
                'validate': ('Approved', 'green'),
                'cancel': ('Cancelled', 'red'),
                'refuse': ('Refused', 'red'),
                'draft': ('Draft', 'gray'),
            }
            state_info = state_map.get(line['state'], ('Draft', 'gray'))
            
            leave_lines.append({
                'id': line['id'],
                'request_date_from': line['request_date_from'].strftime('%Y-%m-%d') if line['request_date_from'] else '',
                'request_date_to': line['request_date_to'].strftime('%Y-%m-%d') if line['request_date_to'] else '',
                'type': line['holiday_status_id'][1] if line['holiday_status_id'] else '',
                'state': state_info[0],
                'color': state_info[1],
            })
        
        # Expense lines
        expenses = self.env['hr.expense'].sudo().search_read(
            [('employee_id', '=', employee['id'])],
            fields=['id', 'name', 'date', 'state', 'total_amount'],
            order='create_date desc',
            limit=20
        )
        
        expense_lines = []
        for line in expenses:
            state_map = {
                'draft': ('To Report', '#17A2B8'),
                'reported': ('To Submit', '#17A2B8'),
                'submitted': ('Submitted', '#FFAC00'),
                'approved': ('Approved', '#28A745'),
                'done': ('Done', '#28A745'),
                'refused': ('Refused', 'red'),
            }
            state_info = state_map.get(line['state'], ('Draft', 'gray'))
            
            expense_lines.append({
                'id': line['id'],
                'date': line['date'].strftime('%Y-%m-%d') if line['date'] else '',
                'name': line['name'],
                'total_amount': line['total_amount'],
                'state': state_info[0],
                'color': state_info[1],
            })
        
        # Manager stats
        leaves_to_approve = self.env['hr.leave'].sudo().search_count(
            [('state', 'in', ['confirm', 'validate1'])]
        )
        
        today = fields.Date.today()
        leaves_today = self.env['hr.leave'].sudo().search_count([
            ('date_from', '<=', today),
            ('date_to', '>=', today),
            ('state', '=', 'validate')
        ])
        
        first_day = date.today().replace(day=1)
        last_day = (date.today() + relativedelta(months=1, day=1)) - timedelta(days=1)
        leaves_this_month = self.env['hr.leave'].sudo().search_count([
            ('date_from', '>=', first_day),
            ('date_from', '<=', last_day),
            ('state', '=', 'validate')
        ])
        
        leaves_alloc_req = self.env['hr.leave.allocation'].sudo().search_count(
            [('state', 'in', ['confirm', 'validate1'])]
        )
        
        timesheet_count = self.env['account.analytic.line'].sudo().search_count(
            [('project_id', '!=', False), ('user_id', '=', uid)]
        )
        
        job_applications = self.env['hr.applicant'].sudo().search_count([])
        
        # Experience calculation
        experience = False
        if employee.get('joining_date'):
            diff = relativedelta(datetime.today(), employee['joining_date'])
            experience = '{} years {} months {} days'.format(diff.years, diff.months, diff.days)
        
        # Payslip count
        payslip_count = 0
        try:
            payslip_count = self.env['hr.payslip'].sudo().search_count(
                [('employee_id', '=', employee['id'])]
            )
        except Exception:
            pass
        
        # Contracts count
        contracts_count = 0
        try:
            contracts_count = self.env['hr.contract'].sudo().search_count(
                [('employee_id', '=', employee['id'])]
            )
        except Exception:
            pass
        
        employee.update({
            'broad_factor': 0,
            'leaves_to_approve': leaves_to_approve,
            'leaves_today': leaves_today,
            'leaves_this_month': leaves_this_month,
            'leaves_alloc_req': leaves_alloc_req,
            'emp_timesheets': timesheet_count,
            'job_applications': job_applications,
            'experience': experience,
            'attendance_lines': attendance_lines,
            'leave_lines': leave_lines,
            'expense_lines': expense_lines,
            'payslip_count': payslip_count,
            'contracts_count': contracts_count,
        })
        
        return [employee]

    @api.model
    def get_upcoming(self):
        """Returns upcoming events, announcements and birthdays"""
        employee = self.env['hr.employee'].search([
            ('user_id', '=', self.env.user.id)
        ], limit=1)
        today = fields.Date.today()
        
        # Birthdays
        birthday_employees = self.env['hr.employee'].search_read(
            [('birthday', '!=', False)],
            fields=['id', 'name', 'birthday'],
            order='birthday ASC',
            limit=5
        )
        
        for emp in birthday_employees:
            bday = emp['birthday']
            if bday.month == today.month and bday.day == today.day:
                emp['is_birthday'] = True
                emp['days'] = 0
            else:
                emp_birthday = bday.replace(year=today.year)
                if emp_birthday < today:
                    emp_birthday = emp_birthday.replace(year=today.year + 1)
                emp['days'] = (emp_birthday - today).days
                emp['is_birthday'] = False
            emp['birthday'] = bday.strftime('%Y-%m-%d')
        
        # Announcements
        announcements = []
        try:
            ann_model = self.env['hr.announcement']
            announcements = ann_model.search_read(
                [('state', '=', 'approved'), ('date_start', '<=', today)],
                fields=['announcement_reason', 'date_start', 'date_end'],
                limit=5
            )
            for ann in announcements:
                ann['date_start'] = ann['date_start'].strftime('%Y-%m-%d') if ann['date_start'] else ''
                ann['date_end'] = ann['date_end'].strftime('%Y-%m-%d') if ann['date_end'] else ''
        except Exception:
            pass
        
        # Events
        events = []
        try:
            events = self.env['event.event'].search_read(
                [('date_begin', '>=', datetime.now())],
                fields=['name', 'date_begin', 'date_end'],
                order='date_begin',
                limit=5
            )
            events = [[e['id'], e['name'], 
                      e['date_begin'].strftime('%Y-%m-%d') if e['date_begin'] else '',
                      e['date_end'].strftime('%Y-%m-%d') if e['date_end'] else '', ''] 
                     for e in events]
        except Exception:
            pass
        
        return {
            'birthday': birthday_employees,
            'event': events,
            'announcement': announcements
        }

    @api.model
    def get_dept_employee(self):
        """Retrieve employee count by department"""
        self.env.cr.execute("""
            SELECT d.id, d.name, COUNT(e.id)
            FROM hr_department d
            LEFT JOIN hr_employee e ON e.department_id = d.id
            WHERE d.active = true
            GROUP BY d.id, d.name
            ORDER BY COUNT(e.id) DESC
        """)
        result = self.env.cr.fetchall()
        data = []
        for row in result:
            dept_name = row[1]
            if isinstance(dept_name, dict):
                dept_name = list(dept_name.values())[0]
            data.append({'label': dept_name, 'value': row[2]})
        return data

    @api.model
    def get_department_leave(self):
        """Returns department monthly leave info"""
        if not self.env.user.has_group('hr.group_hr_manager'):
            return [], []
        
        month_list = []
        for i in range(5, -1, -1):
            last_month = datetime.now() - relativedelta(months=i)
            month_list.append(last_month.strftime('%b %Y'))
        
        departments = self.env['hr.department'].search([('active', '=', True)])
        dept_list = [d.name for d in departments]
        
        graph_result = []
        for month in month_list:
            leave_data = {d.name: 0 for d in departments}
            graph_result.append({
                'l_month': month,
                'leave': leave_data,
                'total': 0
            })
        
        return graph_result, dept_list

    @api.model
    def employee_leave_trend(self):
        """Employee monthly leave trend"""
        graph_result = []
        for i in range(5, -1, -1):
            last_month = datetime.now() - relativedelta(months=i)
            graph_result.append({
                'l_month': last_month.strftime('%b %Y'),
                'leave': 0
            })
        return graph_result

    @api.model
    def join_resign_trends(self):
        """Join/Resign trends"""
        join_trend = []
        resign_trend = []
        for i in range(11, -1, -1):
            last_month = datetime.now() - relativedelta(months=i)
            month_str = last_month.strftime('%b')
            join_trend.append({'l_month': month_str, 'count': 0})
            resign_trend.append({'l_month': month_str, 'count': 0})
        
        return [
            {'name': 'Join', 'values': join_trend},
            {'name': 'Resign', 'values': resign_trend}
        ]

    @api.model
    def get_attrition_rate(self):
        """Monthly attrition rate"""
        result = []
        for i in range(11, -1, -1):
            last_month = datetime.now() - relativedelta(months=i)
            result.append({
                'month': last_month.strftime('%b'),
                'attrition_rate': 0
            })
        return result

    @api.model
    def get_employee_skill(self):
        """Employee skills"""
        employee = self.env['hr.employee'].sudo().search([
            ('user_id', '=', self.env.user.id)
        ], limit=1)
        
        if not employee:
            return []
        
        skills = self.env['hr.employee.skill'].sudo().search([
            ('employee_id', '=', employee.id)
        ])
        
        return [{
            'skills': s.skill_type_id.name + ' - ' + s.skill_id.name,
            'progress': s.level_progress
        } for s in skills]

    @api.model
    def get_employee_project_tasks(self):
        """Get employee's project tasks"""
        tasks = self.env['project.task'].sudo().search([
            ('user_ids', 'in', self.env.uid),
            ('active', '=', True)
        ], order='date_deadline asc', limit=10)
        
        return [{
            'id': t.id,
            'task_name': t.name,
            'project_name': t.project_id.name if t.project_id else 'No Project',
            'date_deadline': t.date_deadline.strftime('%Y-%m-%d') if t.date_deadline else '',
            'stage_name': t.stage_id.name if t.stage_id else 'No Stage',
        } for t in tasks]