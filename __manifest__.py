# -*- coding: utf-8 -*-
{
    'name': 'Open HR Dashboard',
    'version': '18.0.1.0.0',
    'summary': 'Open HR Dashboard with Zoho Style Interface',
    'description': 'Modern HR Dashboard with Zoho People Style Interface',
    'category': 'Human Resources',
    'author': 'Daffodil Group',
    'website': 'https://daffodil.group/',
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
        'mail',
        'crm',
        
    ],
    'external_dependencies': {
        'python': ['pandas'],
    },
    'data': [
        'security/ir.model.access.csv',
        'views/dashboard_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            # Dashboard files
            'hrms_dashboard/static/src/css/dashboard.css',
            'hrms_dashboard/static/src/js/dashboard.js',
            'hrms_dashboard/static/src/xml/dashboard.xml',
            'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.9.4/Chart.js',
        ],
    },
    'images': ['static/description/banner.jpg'],
    'installable': True,
    'application': True,
    'auto_install': False,
    'sequence': -100,
}