// Path-based filter location for nested structure
export type FilterPath = string; // Dot-separated indices like "0.1.2"

export interface FilterLocation {
  path: FilterPath;
  index: number;
}

// Base filter interface
export interface Filter {
  field?: string;
  operator?: string;
  value?: any;
  logic?: 'AND' | 'OR'; // Logic operator for combining with previous filter
  // Range-specific fields
  minOperator?: string;
  minValue?: any;
  maxOperator?: string;
  maxValue?: any;
  // For combined/nested filters
  meta?: {
    type?: string;
    relation?: 'AND' | 'OR';
    params?: Filter[]; // Nested filters for combined filters
  };
}

// Combined filter (nested group)
export interface CombinedFilter extends Filter {
  meta: {
    type: 'combined';
    relation: 'AND' | 'OR';
    params: Filter[];
  };
}

// Filter group for output
export interface FilterGroup {
  filters: Filter[];
  customLabel?: string;
  queryDSL?: any;
}

// Helper to check if filter is a combined filter
export function isCombinedFilter(filter: Filter): filter is CombinedFilter {
  return filter.meta?.type === 'combined' && Array.isArray(filter.meta.params);
}

// Helper to get boolean relation type
export function getBooleanRelationType(filter: Filter): 'AND' | 'OR' | undefined {
  if (isCombinedFilter(filter)) {
    return filter.meta.relation;
  }
  return undefined;
}

// ========== Enhanced Tree Structure for Kibana-style Boolean Logic ==========

/**
 * Represents a single filter condition (leaf node)
 */
export interface FilterCondition extends Filter {
  id: string; // Unique identifier for the filter
}

/**
 * Represents a Boolean operation node (AND/OR)
 */
export interface BooleanNode {
  id: string; // Unique identifier for the node
  operator: 'AND' | 'OR';
  children: FilterNode[]; // Child nodes (filters or nested boolean nodes)
}

/**
 * Union type: A filter node can be either a single filter or a Boolean operation
 */
export type FilterNode = FilterCondition | BooleanNode;

/**
 * Helper to check if a node is a BooleanNode
 */
export function isBooleanNode(node: FilterNode): node is BooleanNode {
  return 'operator' in node && 'children' in node && !('field' in node);
}

/**
 * Helper to check if a node is a FilterCondition
 */
export function isFilterCondition(node: FilterNode): node is FilterCondition {
  return 'field' in node && !('operator' in node && 'children' in node);
}

/**
 * Root structure containing the entire filter hierarchy
 */
export interface FilterTree {
  root: FilterNode | null; // Root node of the tree
  id: string; // Unique identifier for the tree
}

/**
 * Context for filter operations (used in components)
 */
export interface FilterOperationContext {
  nodeId: string;
  parentId?: string;
  path: string[]; // Path from root to this node
}










