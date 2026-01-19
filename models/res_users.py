# -*- coding: utf-8 -*-
from odoo import api, models, fields, SUPERUSER_ID


class ResUsers(models.Model):
    _inherit = 'res.users'

    @property
    def SELF_READABLE_FIELDS(self):
        """Allow reading action_id field"""
        return super().SELF_READABLE_FIELDS + ['action_id']

    @property
    def SELF_WRITEABLE_FIELDS(self):
        """Allow writing action_id field"""
        return super().SELF_WRITEABLE_FIELDS + ['action_id']

    @api.model
    def set_dashboard_as_home_action(self):
        """
        Set HRMS Dashboard as the home action for all internal users.
        This method is called from XML data on module install/upgrade.
        """
        dashboard_action = self.env.ref('hrms_dashboard.dashboard_action_spa', raise_if_not_found=False)
        if dashboard_action:
            # Get all internal (non-portal/public) users
            internal_users = self.with_user(SUPERUSER_ID).search([
                ('share', '=', False),
                ('active', '=', True),
            ])
            if internal_users:
                internal_users.write({'action_id': dashboard_action.id})
        return True

