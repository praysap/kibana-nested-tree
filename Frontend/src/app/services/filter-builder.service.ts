import { Injectable } from '@angular/core';
import { Filter, FilterLocation, FilterPath, isCombinedFilter, CombinedFilter } from '../filter.model';

@Injectable({
  providedIn: 'root'
})
export class FilterBuilderService {
  private readonly PATH_SEPARATOR = '.';

  /**
   * Converts path string to array of indices
   */
  getPathInArray(path: FilterPath): number[] {
    return path.split(this.PATH_SEPARATOR).map(Number);
  }

  /**
   * Gets grouped filters from a combined filter
   */
  getGroupedFilters(filter: Filter): Filter[] {
    if (isCombinedFilter(filter)) {
      return filter.meta.params || [];
    }
    return [];
  }

  /**
   * Gets filter by path in the filter tree
   */
  getFilterByPath(filters: Filter[], path: FilterPath): Filter | undefined {
    const pathInArray = this.getPathInArray(path);
    if (pathInArray.length === 0) {
      return undefined;
    }

    let current: Filter | Filter[] = filters;
    for (const index of pathInArray) {
      if (Array.isArray(current)) {
        current = current[index];
        if (!current) return undefined;
      } else if (isCombinedFilter(current)) {
        current = current.meta.params[index];
        if (!current) return undefined;
      } else {
        return undefined;
      }
    }

    return current as Filter;
  }

  /**
   * Gets container metadata by path (parent filter, target array, parent condition type)
   */
  getContainerMetaByPath(filters: Filter[], pathInArray: number[]): {
    parentFilter?: Filter;
    targetArray: Filter[];
    parentConditionType: 'AND' | 'OR';
  } {
    if (pathInArray.length <= 1) {
      return {
        parentFilter: undefined,
        targetArray: filters,
        parentConditionType: 'AND',
      };
    }

    const parentPath = pathInArray.slice(0, -1).join(this.PATH_SEPARATOR);
    const parentFilter = this.getFilterByPath(filters, parentPath);
    if (!parentFilter || !isCombinedFilter(parentFilter)) {
      return {
        parentFilter: undefined,
        targetArray: filters,
        parentConditionType: 'AND',
      };
    }

    const targetArray = this.getGroupedFilters(parentFilter);
    return {
      parentFilter,
      targetArray: Array.isArray(targetArray) ? targetArray : [],
      parentConditionType: parentFilter.meta.relation || 'AND',
    };
  }

  /**
   * Builds a combined filter
   */
  buildCombinedFilter(
    relation: 'AND' | 'OR',
    filters: Filter[],
    disabled: boolean = false,
    negate: boolean = false
  ): CombinedFilter {
    return {
      meta: {
        type: 'combined',
        relation,
        params: filters,
      },
    } as CombinedFilter;
  }

  /**
   * Normalizes filters - removes empty filters and flattens single-item groups
   */
  normalizeFilters(filters: Filter[]): Filter[] {
    const normalizeArray = (filtersArray: Filter[], parent: Filter[] | Filter): Filter[] => {
      const partiallyNormalized = filtersArray
        .map((item: Filter) => {
          const normalized = normalizeRecursively(item, filtersArray);
          if (Array.isArray(normalized)) {
            if (normalized.length === 1) {
              return normalized[0];
            }
            if (normalized.length === 0) {
              return undefined;
            }
          }
          return normalized;
        })
        .filter(Boolean) as Filter[];
      return Array.isArray(parent) ? partiallyNormalized.flat() : partiallyNormalized;
    };

    const normalizeCombined = (combinedFilter: CombinedFilter): Filter | undefined => {
      const combinedFilters = this.getGroupedFilters(combinedFilter);
      const nonEmptyCombinedFilters = combinedFilters.filter(Boolean);
      if (nonEmptyCombinedFilters.length < 2) {
        return nonEmptyCombinedFilters[0];
      }

      return {
        ...combinedFilter,
        meta: {
          ...combinedFilter.meta,
          params: normalizeRecursively(nonEmptyCombinedFilters, combinedFilter) as Filter[],
        },
      };
    };

    const normalizeRecursively = (
      f: Filter | Filter[],
      parent: Filter[] | Filter
    ): Filter | Filter[] | undefined => {
      if (Array.isArray(f)) {
        return normalizeArray(f, parent);
      } else if (isCombinedFilter(f)) {
        return normalizeCombined(f);
      }
      return f;
    };

    return normalizeArray(filters, filters) as Filter[];
  }

  /**
   * Adds a filter at the specified location with boolean relation
   */
  addFilter(
    filters: Filter[],
    filter: Filter,
    dest: FilterLocation,
    booleanRelation: 'AND' | 'OR'
  ): Filter[] {
    const newFilters = JSON.parse(JSON.stringify(filters)); // Deep clone
    const pathInArray = this.getPathInArray(dest.path);
    const { targetArray, parentConditionType } = this.getContainerMetaByPath(newFilters, pathInArray);
    const selector = pathInArray[pathInArray.length - 1] ?? 0;

    if (booleanRelation && parentConditionType !== booleanRelation) {
      // Need to create a combined filter
      const existingFilter = targetArray[selector];
      if (existingFilter) {
        targetArray[selector] = this.buildCombinedFilter(booleanRelation, [existingFilter, filter]);
      } else {
        targetArray.splice(dest.index, 0, filter);
      }
    } else {
      targetArray.splice(dest.index, 0, filter);
    }

    return newFilters;
  }

  /**
   * Removes a filter at the specified location
   */
  removeFilter(filters: Filter[], dest: FilterLocation): Filter[] {
    const newFilters = JSON.parse(JSON.stringify(filters)); // Deep clone
    const pathInArray = this.getPathInArray(dest.path);
    const meta = this.getContainerMetaByPath(newFilters, pathInArray);
    const target: Array<Filter | undefined> = meta.targetArray;
    target[dest.index] = undefined;

    return this.normalizeFilters(newFilters);
  }

  /**
   * Moves a filter from one location to another
   */
  moveFilter(
    filters: Filter[],
    from: FilterLocation,
    to: FilterLocation,
    booleanRelation: 'AND' | 'OR'
  ): Filter[] {
    const newFilters = JSON.parse(JSON.stringify(filters)); // Deep clone
    const movingFilter = this.getFilterByPath(newFilters, from.path);
    if (!movingFilter) {
      return filters;
    }

    const filtersWithoutRemoved = this.removeFilter(newFilters, from);
    return this.addFilter(filtersWithoutRemoved, movingFilter, to, booleanRelation);
  }

  /**
   * Updates a filter at the specified location
   */
  updateFilter(
    filters: Filter[],
    dest: FilterLocation,
    updates: Partial<Filter>
  ): Filter[] {
    const newFilters = JSON.parse(JSON.stringify(filters)); // Deep clone
    const pathInArray = this.getPathInArray(dest.path);
    const { targetArray } = this.getContainerMetaByPath(newFilters, pathInArray);
    const selector = pathInArray[pathInArray.length - 1];

    const existingFilter = targetArray[selector];
    if (existingFilter) {
      targetArray[selector] = { ...existingFilter, ...updates };
    }

    return newFilters;
  }

  /**
   * Flattens all filters recursively for preview/display
   */
  flattenFilters(filters: Filter[]): Filter[] {
    const result: Filter[] = [];
    
    const flatten = (filterList: Filter[]) => {
      for (const filter of filterList) {
        if (isCombinedFilter(filter)) {
          flatten(filter.meta.params);
        } else {
          result.push(filter);
        }
      }
    };

    flatten(filters);
    return result;
  }
}

