/**
 * Foreign key relationships for PostgREST-style embedding.
 * Used by the query handler to resolve joins like `categories(name)`.
 */

interface FkRelation {
  fkColumn: string;   // column in the source table
  pkColumn: string;   // column in the target table
}

interface TableRelations {
  forward: Record<string, FkRelation>;   // this table has FK → target table
  reverse: Record<string, FkRelation>;   // target table has FK → this table
}

export const RELATIONSHIPS: Record<string, TableRelations> = {
  bead_patterns: {
    forward: {
      categories: { fkColumn: 'category_id', pkColumn: 'id' },
      profiles: { fkColumn: 'user_id', pkColumn: 'user_id' },
    },
    reverse: {
      bead_plates: { fkColumn: 'pattern_id', pkColumn: 'id' },
      user_favorites: { fkColumn: 'pattern_id', pkColumn: 'id' },
      user_progress: { fkColumn: 'pattern_id', pkColumn: 'id' },
      pdf_downloads: { fkColumn: 'pattern_id', pkColumn: 'id' },
    },
  },
  categories: {
    forward: {},
    reverse: {
      bead_patterns: { fkColumn: 'category_id', pkColumn: 'id' },
    },
  },
  bead_plates: {
    forward: {
      bead_patterns: { fkColumn: 'pattern_id', pkColumn: 'id' },
    },
    reverse: {},
  },
  bead_colors: { forward: {}, reverse: {} },
  profiles: { forward: {}, reverse: {} },
  user_favorites: {
    forward: {
      bead_patterns: { fkColumn: 'pattern_id', pkColumn: 'id' },
    },
    reverse: {},
  },
  user_progress: {
    forward: {
      bead_patterns: { fkColumn: 'pattern_id', pkColumn: 'id' },
    },
    reverse: {},
  },
  user_roles: { forward: {}, reverse: {} },
  announcements: { forward: {}, reverse: {} },
  pdf_downloads: {
    forward: {
      bead_patterns: { fkColumn: 'pattern_id', pkColumn: 'id' },
    },
    reverse: {},
  },
};

// Tables that allow public read access (no auth required for SELECT)
export const PUBLIC_READ_TABLES = [
  'categories', 'bead_colors', 'announcements', 'bead_patterns', 'profiles',
];

// Tables that allow public insert (no auth required for INSERT)
export const PUBLIC_INSERT_TABLES = ['pdf_downloads'];
