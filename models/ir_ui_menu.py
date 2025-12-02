# -*- coding: utf-8 -*-
from odoo import api, models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    @api.model
    def get_zoho_apps(self):
        """Returns all root-level menu items with their actions"""
        menus = self.search([('parent_id', '=', False)], order='sequence')
        
        apps_data = []
        for menu in menus:
            # Check user access
            try:
                if menu.groups_id and not (menu.groups_id & self.env.user.groups_id):
                    continue
            except Exception:
                pass
            
            # Get action information
            action_id = False
            action_model = False
            
            if menu.action:
                action_id = menu.action.id
                action_model = menu.action._name
            else:
                # Try to find first child menu with action
                child_menus = self.search([
                    ('parent_id', '=', menu.id)
                ], order='sequence', limit=1)
                
                for child in child_menus:
                    if child.action:
                        action_id = child.action.id
                        action_model = child.action._name
                        break
                    else:
                        # Go deeper
                        subchild_menus = self.search([
                            ('parent_id', '=', child.id)
                        ], order='sequence', limit=1)
                        for subchild in subchild_menus:
                            if subchild.action:
                                action_id = subchild.action.id
                                action_model = subchild.action._name
                                break
            
            # Get web icon data
            web_icon_data = False
            if menu.web_icon_data:
                if isinstance(menu.web_icon_data, bytes):
                    web_icon_data = menu.web_icon_data.decode('utf-8')
                else:
                    web_icon_data = menu.web_icon_data
            
            apps_data.append({
                'id': menu.id,
                'name': menu.name,
                'action_id': action_id,
                'action_model': action_model,
                'web_icon': menu.web_icon,
                'web_icon_data': web_icon_data,
                'sequence': menu.sequence,
            })
        
        return apps_data

    @api.model
    def get_menu_action(self, menu_id):
        """Get the action for a specific menu, searching children if needed"""
        menu = self.browse(menu_id)
        
        if menu.action:
            return {
                'action_id': menu.action.id,
                'action_model': menu.action._name,
            }
        
        # Search children
        child_menus = self.search([
            ('parent_id', '=', menu_id)
        ], order='sequence')
        
        for child in child_menus:
            if child.action:
                return {
                    'action_id': child.action.id,
                    'action_model': child.action._name,
                }
            
            # Recursive search
            result = self.get_menu_action(child.id)
            if result:
                return result
        
        return None