# -*- coding: utf-8 -*-
from odoo import api, models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    @api.model
    def get_zoho_apps(self):
        """Returns all root-level menu items"""
        try:
            menus = self.search([('parent_id', '=', False)], order='sequence')
            
            apps_data = []
            for menu in menus:
                try:
                    if menu.groups_id and not (menu.groups_id & self.env.user.groups_id):
                        continue
                except Exception:
                    pass
                
                action_id = menu.action.id if menu.action else False
                
                web_icon_data = False
                if menu.web_icon_data:
                    try:
                        if isinstance(menu.web_icon_data, bytes):
                            web_icon_data = menu.web_icon_data.decode('utf-8')
                        else:
                            web_icon_data = menu.web_icon_data
                    except Exception:
                        pass
                
                apps_data.append({
                    'id': menu.id,
                    'name': menu.name or '',
                    'action_id': action_id,
                    'web_icon': menu.web_icon or '',
                    'web_icon_data': web_icon_data,
                    'sequence': menu.sequence,
                })
            
            return apps_data
        except Exception:
            return []

    @api.model
    def get_menu_with_all_children(self, menu_id, max_depth=3):
        """Get menu with children recursively"""
        try:
            menu = self.browse(menu_id)
            
            if not menu.exists():
                return None
            
            def get_children_recursive(parent_id, depth=0):
                if depth >= max_depth:
                    return []
                
                children = []
                try:
                    child_menus = self.search([
                        ('parent_id', '=', parent_id)
                    ], order='sequence')
                    
                    for child in child_menus:
                        try:
                            if child.groups_id and not (child.groups_id & self.env.user.groups_id):
                                continue
                        except Exception:
                            pass
                        
                        action_id = child.action.id if child.action else False
                        
                        child_data = {
                            'id': child.id,
                            'name': child.name or '',
                            'action_id': action_id,
                            'sequence': child.sequence,
                            'children': get_children_recursive(child.id, depth + 1),
                        }
                        children.append(child_data)
                except Exception:
                    pass
                
                return children
            
            action_id = menu.action.id if menu.action else False
            
            return {
                'id': menu.id,
                'name': menu.name or '',
                'action_id': action_id,
                'children': get_children_recursive(menu_id, 0),
            }
        except Exception:
            return None