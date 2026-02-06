import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { FilterNode, BooleanNode, FilterCondition, isBooleanNode, isFilterCondition } from '../filter.model';
import { FilterStateService } from '../services/filter-state.service';

@Component({
  selector: 'app-filter-node',
  templateUrl: './filter-node.component.html',
  styleUrls: ['./filter-node.component.scss']
})
export class FilterNodeComponent implements OnInit, OnChanges {
  @Input() node!: FilterNode;
  @Input() depth: number = 0;
  @Input() availableFields: string[] = [];
  @Input() operators: Array<{ label: string; value: string }> = [];
  @Input() rangeOperators: Array<{ label: string; value: string }> = [];
  @Input() fieldValuesMap: { [key: string]: string[] } = {};
  @Input() loadingFieldValues: { [key: string]: boolean } = {};

  @Output() nodeChange = new EventEmitter<FilterNode>();
  @Output() addFilter = new EventEmitter<{ parentId: string; operator: 'AND' | 'OR' }>();
  @Output() removeFilter = new EventEmitter<string>();
  @Output() toggleOperator = new EventEmitter<string>();
  @Output() fieldChange = new EventEmitter<{ nodeId: string; field: string }>();
  @Output() operatorChange = new EventEmitter<{ nodeId: string; operator: string }>();
  @Output() valueChange = new EventEmitter<{ nodeId: string; value: any }>();

  isBoolean = false;
  isFilter = false;
  booleanNode?: BooleanNode;
  filterCondition?: FilterCondition;

  constructor(private filterStateService: FilterStateService) {}

  ngOnInit(): void {
    this.updateNodeType();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.updateNodeType();
  }

  private updateNodeType(): void {
    if (!this.node) return;

    this.isBoolean = isBooleanNode(this.node);
    this.isFilter = isFilterCondition(this.node);

    if (this.isBoolean) {
      this.booleanNode = this.node as BooleanNode;
    } else if (this.isFilter) {
      this.filterCondition = this.node as FilterCondition;
    }
  }

  onAddFilter(operator: 'AND' | 'OR'): void {
    this.addFilter.emit({ parentId: this.node.id, operator });
  }

  onRemoveFilter(): void {
    this.removeFilter.emit(this.node.id);
  }

  onToggleOperator(): void {
    if (this.isBoolean) {
      this.toggleOperator.emit(this.node.id);
    }
  }

  onFieldChange(field: string): void {
    this.fieldChange.emit({ nodeId: this.node.id, field });
  }

  onOperatorChange(operator: string): void {
    this.operatorChange.emit({ nodeId: this.node.id, operator });
  }

  onValueChange(value: any): void {
    this.valueChange.emit({ nodeId: this.node.id, value });
  }

  onRangeValueChange(minValue?: any, maxValue?: any, minOperator?: string, maxOperator?: string): void {
    const updates: Partial<FilterCondition> = {};
    if (minValue !== undefined) updates.minValue = minValue;
    if (maxValue !== undefined) updates.maxValue = maxValue;
    if (minOperator !== undefined) updates.minOperator = minOperator;
    if (maxOperator !== undefined) updates.maxOperator = maxOperator;
    
    this.filterStateService.modifyFilter(this.node.id, null, updates);
  }

  getFieldValues(field: string): string[] {
    const key = `${this.node.id}_${field}`;
    return this.fieldValuesMap[key] || [];
  }

  isLoadingFieldValues(field: string): boolean {
    const key = `${this.node.id}_${field}`;
    return this.loadingFieldValues[key] || false;
  }

  isKeywordField(field: string): boolean {
    return field.endsWith('.keyword');
  }

  getMinRangeOperators() {
    return this.rangeOperators.filter(op => op.value === 'gt' || op.value === 'gte');
  }

  getMaxRangeOperators() {
    return this.rangeOperators.filter(op => op.value === 'lt' || op.value === 'lte');
  }

  getValuePlaceholder(): string {
    if (!this.filterCondition) return 'Enter value';
    
    const field = this.filterCondition.field || '';
    const operator = this.filterCondition.operator || '';

    if (!field) {
      return 'Please select a field first...';
    }
    
    if (!operator) {
      return 'Please select operator first...';
    }

    if (operator === 'exists' || operator === 'does_not_exist') {
      return 'No value needed';
    }

    if (operator === 'prefix' || operator === 'wildcard' || operator === 'query_string') {
      return 'Search';
    }

    return 'Enter value';
  }
}

