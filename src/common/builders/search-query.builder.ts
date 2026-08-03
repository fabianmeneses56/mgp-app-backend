export type SortOrder = 'ASC' | 'DESC';

export interface BuiltQuery<T> {
  filters: Partial<Record<keyof T, any>>;
  sort: { field: keyof T; order: SortOrder } | null;
  pagination: { page: number; limit: number };
}

export class SearchQueryBuilder<T> {
  private filters: Partial<Record<keyof T, any>> = {};
  private sortField?: keyof T;
  private sortOrder: SortOrder = 'ASC';
  private page = 1;
  private limit = 10;

  where(field: keyof T, value: any): this {
    if (value !== undefined && value !== null && value !== '') {
      this.filters[field] = value;
    }
    return this;
  }

  orderBy(field: keyof T, order: SortOrder = 'ASC'): this {
    this.sortField = field;
    this.sortOrder = order;
    return this;
  }

  paginate(page: number, limit: number): this {
    this.page = Math.max(1, page || 1);
    this.limit = Math.min(50, Math.max(1, limit || 10));
    return this;
  }

  build(): BuiltQuery<T> {
    return {
      filters: this.filters,
      sort: this.sortField
        ? { field: this.sortField, order: this.sortOrder }
        : null,
      pagination: { page: this.page, limit: this.limit },
    };
  }
}
