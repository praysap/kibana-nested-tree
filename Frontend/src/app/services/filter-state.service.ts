import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FilterNode, BooleanNode, FilterCondition, FilterTree, isBooleanNode, isFilterCondition } from '../filter.model';

@Injectable({
  providedIn: 'root'
})
export class FilterStateService {
  private filterTreeSubject = new BehaviorSubject<FilterTree>({ root: null, id: this.generateId() });
  public filterTree$: Observable<FilterTree> = this.filterTreeSubject.asObservable();

  constructor() {}

  /**
   * Gets the current filter tree
   */
  getFilterTree(): FilterTree {
    return this.filterTreeSubject.value;
  }

  /**
   * Sets the filter tree
   */
  setFilterTree(tree: FilterTree): void {
    this.filterTreeSubject.next(tree);
  }

  /**
   * Initializes with a base filter
   */
  initializeWithFilter(filter: Partial<FilterCondition>): void {
    const condition: FilterCondition = {
      id: this.generateId(),
      field: filter.field || '',
      operator: filter.operator || '',
      value: filter.value || '',
      minOperator: filter.minOperator || 'gt',
      minValue: filter.minValue || '',
      maxOperator: filter.maxOperator || 'lt',
      maxValue: filter.maxValue || '',
    };

    const tree: FilterTree = {
      root: condition,
      id: this.generateId()
    };

    this.setFilterTree(tree);
  }

  /**
   * Adds a filter with the specified operator at the given parent node
   * Implements Kibana 8.18.1 behavior:
   * - If parent is a BooleanNode with same operator, add to its children
   * - If parent is a BooleanNode with different operator, wrap in new BooleanNode
   * - If parent is a FilterCondition, wrap both in a BooleanNode
   */
  addFilter(parentNodeId: string, operator: 'AND' | 'OR', filter: Partial<FilterCondition>): void {
    const tree = this.getFilterTree();
    if (!tree.root) {
      // No root - initialize with the new filter
      this.initializeWithFilter(filter);
      return;
    }

    const newCondition: FilterCondition = {
      id: this.generateId(),
      field: filter.field || '',
      operator: filter.operator || '',
      value: filter.value || '',
      minOperator: filter.minOperator || 'gt',
      minValue: filter.minValue || '',
      maxOperator: filter.maxOperator || 'lt',
      maxValue: filter.maxValue || '',
    };

    const newRoot = this.addFilterRecursive(tree.root, parentNodeId, operator, newCondition);
    
    this.setFilterTree({
      ...tree,
      root: newRoot
    });
  }

  /**
   * Recursively adds a filter to the tree
   * Matches Kibana's exact behavior:
   * - If parent is FilterCondition: wrap both in BooleanNode
   * - If parent is BooleanNode with same operator: add to children array
   * - If parent is BooleanNode with different operator: wrap the parent node in new BooleanNode with new filter
   */
  private addFilterRecursive(
    node: FilterNode,
    parentNodeId: string,
    operator: 'AND' | 'OR',
    newFilter: FilterCondition
  ): FilterNode {
    if (node.id === parentNodeId) {
      // Found the parent node
      if (isFilterCondition(node)) {
        // Parent is a filter condition - wrap both in a BooleanNode (Kibana behavior)
        return {
          id: this.generateId(),
          operator,
          children: [node, newFilter]
        };
      } else if (isBooleanNode(node)) {
        // Parent is a BooleanNode
        if (node.operator === operator) {
          // Same operator - add to children array (Kibana behavior)
          return {
            ...node,
            children: [...node.children, newFilter]
          };
        } else {
          // Different operator - wrap existing BooleanNode and new filter in a new BooleanNode (Kibana behavior)
          // This creates nested groups: (existing AND filters) OR newFilter
          return {
            id: this.generateId(),
            operator,
            children: [node, newFilter]
          };
        }
      }
    }

    if (isBooleanNode(node)) {
      // Recursively search in children
      return {
        ...node,
        children: node.children.map(child => 
          this.addFilterRecursive(child, parentNodeId, operator, newFilter)
        )
      };
    }

    return node;
  }

  /**
   * Modifies a filter at the specified node
   */
  modifyFilter(nodeId: string, operator: 'AND' | 'OR' | null, newFilter: Partial<FilterCondition>): void {
    const tree = this.getFilterTree();
    if (!tree.root) return;

    const newRoot = this.modifyFilterRecursive(tree.root, nodeId, operator, newFilter);
    
    this.setFilterTree({
      ...tree,
      root: newRoot
    });
  }

  /**
   * Recursively modifies a filter
   */
  private modifyFilterRecursive(
    node: FilterNode,
    nodeId: string,
    operator: 'AND' | 'OR' | null,
    updates: Partial<FilterCondition>
  ): FilterNode {
    if (node.id === nodeId) {
      if (isFilterCondition(node)) {
        // Update the filter condition
        const updated: FilterCondition = {
          ...node,
          ...updates
        };
        return updated;
      } else if (isBooleanNode(node) && operator !== null) {
        // Update the operator
        return {
          ...node,
          operator
        };
      }
    }

    if (isBooleanNode(node)) {
      return {
        ...node,
        children: node.children.map(child => 
          this.modifyFilterRecursive(child, nodeId, operator, updates)
        )
      };
    }

    return node;
  }

  /**
   * Removes a filter at the specified node
   */
  removeFilter(nodeId: string): void {
    const tree = this.getFilterTree();
    if (!tree.root) return;

    if (tree.root.id === nodeId) {
      // Removing root
      this.setFilterTree({ root: null, id: this.generateId() });
      return;
    }

    const newRoot = this.removeFilterRecursive(tree.root, nodeId);
    
    // Normalize: if root is a BooleanNode with one child, replace with child
    const normalizedRoot = this.normalizeNode(newRoot);
    
    this.setFilterTree({
      ...tree,
      root: normalizedRoot
    });
  }

  /**
   * Recursively removes a filter
   */
  private removeFilterRecursive(node: FilterNode, nodeId: string): FilterNode | null {
    if (isBooleanNode(node)) {
      const filteredChildren = node.children
        .map(child => this.removeFilterRecursive(child, nodeId))
        .filter((child): child is FilterNode => child !== null);

      if (filteredChildren.length === 0) {
        return null;
      }

      if (filteredChildren.length === 1) {
        return filteredChildren[0];
      }

      return {
        ...node,
        children: filteredChildren
      };
    }

    if (node.id === nodeId) {
      return null;
    }

    return node;
  }

  /**
   * Toggles the operator of a BooleanNode
   */
  toggleOperator(nodeId: string): void {
    const tree = this.getFilterTree();
    if (!tree.root) return;

    const newRoot = this.toggleOperatorRecursive(tree.root, nodeId);
    
    this.setFilterTree({
      ...tree,
      root: newRoot
    });
  }

  /**
   * Recursively toggles operator
   */
  private toggleOperatorRecursive(node: FilterNode, nodeId: string): FilterNode {
    if (isBooleanNode(node) && node.id === nodeId) {
      return {
        ...node,
        operator: node.operator === 'AND' ? 'OR' : 'AND'
      };
    }

    if (isBooleanNode(node)) {
      return {
        ...node,
        children: node.children.map(child => 
          this.toggleOperatorRecursive(child, nodeId)
        )
      };
    }

    return node;
  }

  /**
   * Normalizes a node (removes unnecessary nesting)
   */
  private normalizeNode(node: FilterNode | null): FilterNode | null {
    if (!node) return null;

    if (isBooleanNode(node)) {
      const normalizedChildren = node.children
        .map(child => this.normalizeNode(child))
        .filter((child): child is FilterNode => child !== null);

      if (normalizedChildren.length === 0) {
        return null;
      }

      if (normalizedChildren.length === 1) {
        return normalizedChildren[0];
      }

      return {
        ...node,
        children: normalizedChildren
      };
    }

    return node;
  }

  /**
   * Generates a human-readable preview with parentheses
   */
  generatePreview(): string {
    const tree = this.getFilterTree();
    if (!tree.root) return '';

    return this.generatePreviewRecursive(tree.root);
  }

  /**
   * Recursively generates preview with proper parentheses
   * Matches Kibana's preview behavior:
   * - Shows parentheses when nested groups have different operators
   * - Shows parentheses around individual child previews that are BooleanNodes with different operators
   */
  private generatePreviewRecursive(node: FilterNode, parentOperator?: 'AND' | 'OR'): string {
    if (isFilterCondition(node)) {
      const field = node.field || '-';
      const value = node.value || '-';
      const hasNot = this.isNegatedFilter(node);
      
      const filterText = `${field}: ${value}`;
      return hasNot ? `NOT ${filterText}` : filterText;
    }

    if (isBooleanNode(node)) {
      const childrenPreviews = node.children.map((child, index) => {
        const childPreview = this.generatePreviewRecursive(child, node.operator);
        
        // Add parentheses around child if:
        // 1. Child is a BooleanNode with different operator than parent
        // 2. OR if parent operator differs from grandparent (handled by recursive call)
        if (isBooleanNode(child) && child.operator !== node.operator) {
          return `(${childPreview})`;
        }
        return childPreview;
      });

      const joined = childrenPreviews.join(` ${node.operator} `);
      
      // Add parentheses around entire group if parent operator exists and differs
      if (parentOperator && parentOperator !== node.operator) {
        return `(${joined})`;
      }
      
      return joined;
    }

    return '';
  }

  /**
   * Checks if a filter is negated
   */
  private isNegatedFilter(filter: FilterCondition): boolean {
    const operator = filter.operator || '';
    return operator === 'is_not' || 
           operator === 'does_not_exist' || 
           operator === 'is_not_one_of';
  }

  /**
   * Generates Elasticsearch Query DSL from the filter tree
   */
  generateQueryDSL(): any {
    const tree = this.getFilterTree();
    if (!tree.root) {
      return { match_all: {} };
    }

    return this.generateQueryDSLRecursive(tree.root);
  }

  /**
   * Recursively generates Query DSL
   */
  private generateQueryDSLRecursive(node: FilterNode): any {
    if (isFilterCondition(node)) {
      return this.buildSingleFilterQuery(node);
    }

    if (isBooleanNode(node)) {
      const childQueries = node.children
        .map(child => this.generateQueryDSLRecursive(child))
        .filter(query => query && !this.isEmptyQuery(query));

      if (childQueries.length === 0) {
        return { match_all: {} };
      }

      if (childQueries.length === 1) {
        return childQueries[0];
      }

      if (node.operator === 'OR') {
        return {
          bool: {
            should: childQueries,
            minimum_should_match: 1
          }
        };
      } else {
        return {
          bool: {
            must: childQueries
          }
        };
      }
    }

    return { match_all: {} };
  }

  /**
   * Builds a single Elasticsearch query from a filter condition
   */
  private buildSingleFilterQuery(filter: FilterCondition): any {
    if (!filter.field || !filter.operator) {
      return null;
    }

    const operator = filter.operator;
    const field = filter.field;
    const value = filter.value;
    const isKeyword = field.endsWith('.keyword');

    // Helper to check if value is numeric
    const isNumeric = (val: any): boolean => {
      if (val === null || val === undefined || val === '') return false;
      if (typeof val === 'number') return true;
      if (typeof val === 'string') {
        return /^-?\d+(\.\d+)?$/.test(val.trim());
      }
      return false;
    };

    // Helper to convert value
    const convertValue = (val: any): any => {
      if (isKeyword) return val;
      if (isNumeric(val)) {
        const num = typeof val === 'string' ? parseFloat(val.trim()) : val;
        return isNaN(num) ? val : num;
      }
      return val;
    };

    switch (operator) {
      case 'is':
        if (isKeyword || isNumeric(value)) {
          return { term: { [field]: convertValue(value) } };
        }
        return { match: { [field]: value } };
      
      case 'is_not':
        if (isKeyword || isNumeric(value)) {
          return { bool: { must_not: [{ term: { [field]: convertValue(value) } }] } };
        }
        return { bool: { must_not: [{ match: { [field]: value } }] } };
      
      case 'is_one_of':
        const values = Array.isArray(value) 
          ? value 
          : (typeof value === 'string' ? value.split(',').map(v => v.trim()) : [value]);
        return { terms: { [field]: values } };
      
      case 'is_not_one_of':
        const notValues = Array.isArray(value) 
          ? value 
          : (typeof value === 'string' ? value.split(',').map(v => v.trim()) : [value]);
        return { bool: { must_not: [{ terms: { [field]: notValues } }] } };
      
      case 'exists':
        return { exists: { field } };
      
      case 'does_not_exist':
        return { bool: { must_not: [{ exists: { field } }] } };
      
      case 'range':
        const rangeQuery: any = {};
        if (filter.minValue) {
          rangeQuery[filter.minOperator || 'gt'] = convertValue(filter.minValue);
        }
        if (filter.maxValue) {
          rangeQuery[filter.maxOperator || 'lt'] = convertValue(filter.maxValue);
        }
        if (Object.keys(rangeQuery).length > 0) {
          return { range: { [field]: rangeQuery } };
        }
        return null;
      
      case 'prefix':
        if (!value) return null;
        if (isKeyword) {
          return { prefix: { [field]: value } };
        }
        return { wildcard: { [field]: { value: `${value}*`, case_insensitive: true } } };
      
      case 'wildcard':
        if (!value) return null;
        return { wildcard: { [field]: { value, case_insensitive: true } } };
      
      case 'query_string':
        if (!value) return null;
        return { query_string: { default_field: field, query: value } };
      
      default:
        return null;
    }
  }

  /**
   * Checks if query is empty
   */
  private isEmptyQuery(query: any): boolean {
    return !query || (query.match_all && Object.keys(query).length === 1);
  }

  /**
   * Finds a node by ID
   */
  findNodeById(nodeId: string): FilterNode | null {
    const tree = this.getFilterTree();
    if (!tree.root) return null;

    return this.findNodeByIdRecursive(tree.root, nodeId);
  }

  /**
   * Recursively finds a node by ID
   */
  private findNodeByIdRecursive(node: FilterNode, nodeId: string): FilterNode | null {
    if (node.id === nodeId) {
      return node;
    }

    if (isBooleanNode(node)) {
      for (const child of node.children) {
        const found = this.findNodeByIdRecursive(child, nodeId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Gets the path to a node
   */
  getNodePath(nodeId: string): string[] {
    const tree = this.getFilterTree();
    if (!tree.root) return [];

    const path: string[] = [];
    this.getNodePathRecursive(tree.root, nodeId, path);
    return path;
  }

  /**
   * Recursively gets node path
   */
  private getNodePathRecursive(node: FilterNode, nodeId: string, path: string[]): boolean {
    if (node.id === nodeId) {
      path.push(node.id);
      return true;
    }

    if (isBooleanNode(node)) {
      path.push(node.id);
      for (const child of node.children) {
        if (this.getNodePathRecursive(child, nodeId, path)) {
          return true;
        }
      }
      path.pop();
    }

    return false;
  }

  /**
   * Resets the filter tree
   */
  reset(): void {
    this.setFilterTree({ root: null, id: this.generateId() });
  }

  /**
   * Generates a unique ID
   */
  private generateId(): string {
    return `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

