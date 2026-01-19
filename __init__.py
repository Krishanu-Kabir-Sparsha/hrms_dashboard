# -*- coding: utf-8 -*-
from . import models


def _post_init_hook(env):
    """
    Post-installation hook to set HRMS Dashboard as the default 
    home action for ALL existing users after module installation.
    """
    dashboard_action = env.ref('hrms_dashboard.dashboard_action_spa', raise_if_not_found=False)
    if dashboard_action:
        # Set dashboard as default for ALL internal users (override any existing action)
        users = env['res.users'].search([('share', '=', False)])
        if users:
            users.write({'action_id': dashboard_action.id})
