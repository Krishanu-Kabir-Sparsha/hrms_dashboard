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
        
        # Search immediate children
        child_menus = self.search([
            ('parent_id', '=', menu_id)
        ], order='sequence', limit=10)
        
        for child in child_menus:
            if child.action:
                return {
                    'action_id': child.action.id,
                    'action_model': child.action._name,
                }
        
        return None

    @api.model
    def get_deep_menu_action(self, menu_id, max_depth=5):
        """
        Recursively search for an action in menu hierarchy.
        This handles complex modules like Appraisal that have nested menus.
        """
        menu = self.browse(menu_id)
        
        if not menu.exists():
            return None
        
        # If this menu has an action, return it
        if menu.action:
            return {
                'action_id': menu.action.id,
                'action_model': menu.action._name,
                'menu_id': menu.id,
            }
        
        # Search children recursively
        return self._find_action_recursive(menu_id, 0, max_depth)
    
    def _find_action_recursive(self, menu_id, current_depth, max_depth):
        """Helper method for recursive action search"""
        if current_depth >= max_depth:
            return None
        
        child_menus = self.search([
            ('parent_id', '=', menu_id)
        ], order='sequence')
        
        for child in child_menus:
            # Check user access
            try:
                if child.groups_id and not (child.groups_id & self.env.user.groups_id):
                    continue
            except Exception:
                pass
            
            if child.action:
                return {
                    'action_id': child.action.id,
                    'action_model': child.action._name,
                    'menu_id': child.id,
                }
            
            # Recurse into children
            result = self._find_action_recursive(child.id, current_depth + 1, max_depth)
            if result:
                return result
        
        return None

    @api.model
    def get_menu_with_children(self, menu_id):
        """Get menu with its first-level children that have actions"""
        menu = self.browse(menu_id)
        
        if not menu.exists():
            return None
        
        children = []
        child_menus = self.search([
            ('parent_id', '=', menu_id)
        ], order='sequence')
        
        for child in child_menus:
            try:
                if child.groups_id and not (child.groups_id & self.env.user.groups_id):
                    continue
            except Exception:
                pass
            
            action_id = False
            if child.action:
                action_id = child.action.id
            
            children.append({
                'id': child.id,
                'name': child.name,
                'action_id': action_id,
                'sequence': child.sequence,
            })
        
        return {
            'id': menu.id,
            'name': menu.name,
            'action_id': menu.action.id if menu.action else False,
            'children': children,
        }

    @api.model
    def get_menu_with_all_children(self, menu_id, max_depth=3):
        """
        Get menu with ALL children recursively (for embedded view navigation).
        Returns complete menu tree structure.
        """
        menu = self.browse(menu_id)
        
        if not menu.exists():
            return None
        
        def get_children_recursive(parent_id, depth=0):
            if depth >= max_depth:
                return []
            
            children = []
            child_menus = self.search([
                ('parent_id', '=', parent_id)
            ], order='sequence')
            
            for child in child_menus:
                # Check user access
                try:
                    if child.groups_id and not (child.groups_id & self.env.user.groups_id):
                        continue
                except Exception:
                    pass
                
                action_id = False
                action_model = False
                res_model = False
                
                if child.action:
                    action_id = child.action.id
                    action_model = child.action._name
                    # Get res_model for act_window actions
                    if hasattr(child.action, 'res_model'):
                        res_model = child.action.res_model
                
                child_data = {
                    'id': child.id,
                    'name': child.name,
                    'action_id': action_id,
                    'action_model': action_model,
                    'res_model': res_model,
                    'sequence': child.sequence,
                    'children': get_children_recursive(child.id, depth + 1),
                }
                children.append(child_data)
            
            return children
        
        # Get root menu action info
        action_id = False
        action_model = False
        res_model = False
        
        if menu.action:
            action_id = menu.action.id
            action_model = menu.action._name
            if hasattr(menu.action, 'res_model'):
                res_model = menu.action.res_model
        
        return {
            'id': menu.id,
            'name': menu.name,
            'action_id': action_id,
            'action_model': action_model,
            'res_model': res_model,
            'children': get_children_recursive(menu_id, 0),
        }

    @api.model
    def get_action_data(self, action_id):
        """Get detailed action data for embedded rendering"""
        try:
            action = self.env['ir.actions.act_window'].browse(action_id)
            
            if not action.exists():
                return None
            
            # Get view information
            views = []
            for view_id, view_type in action.views:
                views.append([view_id, view_type])
            
            if not views and action.view_mode:
                for view_type in action.view_mode.split(','):
                    views.append([False, view_type.strip()])
            
            return {
                'id': action.id,
                'name': action.name,
                'res_model': action.res_model,
                'view_mode': action.view_mode,
                'views': views,
                'domain': action.domain or '[]',
                'context': action.context or '{}',
                'target': action.target,
                'search_view_id': action.search_view_id.id if action.search_view_id else False,
                'limit': action.limit,
                'help': action.help,
            }
        except Exception as e:
            return None