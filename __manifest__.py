# -*- coding: utf-8 -*-
{
    'name': 'Open HRMS HR Dashboard',
    'version': '18.0.1.0.0',
    'summary': 'Open HRMS - HR Dashboard with Zoho Style Interface',
    'description': 'Modern HR Dashboard with Zoho People Style Interface',
    'category': 'Human Resources',
    'author': 'Cybrosys Techno Solutions',
    'website': 'https://www.openhrms.com',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'web',
        'hr',
        'hr_holidays',
        'hr_attendance',
        'hr_expense',
        'hr_timesheet',
        'hr_recruitment',
        'project',
        'event',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/dashboard_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            # Chart.js CDN
            ('include', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'),
            # Dashboard files
            'hrms_dashboard/static/src/css/dashboard.css',
            'hrms_dashboard/static/src/js/dashboard.js',
            'hrms_dashboard/static/src/xml/dashboard.xml',
        ],
    },
    'images': ['static/description/banner.jpg'],
    'installable': True,
    'application': True,
    'auto_install': False,
    'sequence': -100,
}