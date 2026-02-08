

# Galleri-kort: Ikon-knapper, metadata-redigering og adgangsstyring

## Oversigt

Fire aendringer til PatternCard og CategoryFilter:

1. Alle knapper i footer goeres til rene ikon-knapper (ingen tekst)
2. Ny "Ret metadata"-knap med dialog til at aendre titel og kategori
3. Adgangsstyring: Admin ser alle 3 knapper, ejer ser meta+rediger, ikke-logget-ind ser ingen
4. Fjern "Kategori:"-teksten fra CategoryFilter

---

## 1. Alle footer-knapper som rene ikon-knapper

I dag har knapperne tekst som "Aaben", "Nulstil", "PDF". Disse erstattes med rene ikon-knapper med tooltips saa brugeren stadig kan se hvad de goer ved hover.

Knapperne faar alle `h-7 w-7 p-0` styling (som rediger/slet allerede har) og et `title`-attribut for tilgaengelighed.

---

## 2. Ny "Ret metadata"-dialog

En ny knap med et `Settings`/`FileEdit`-ikon placeres til venstre for rediger-knappen. Ved klik aabnes en dialog hvor brugeren kan:

- AEndre **titel** (input-felt)
- AEndre **kategori** (dropdown med eksisterende kategorier + mulighed for at oprette ny)

Naar metadata gemmes:
- Opdater `bead_patterns` med ny titel og category_id
- Hvis kategorien aendres, skal den gamle kategori slettes hvis den bliver tom

### Automatisk oprydning ved kategori-aendring

Den eksisterende `cleanup_empty_categories`-trigger koerer kun ved DELETE. Vi tilfojer en tilsvarende trigger paa UPDATE, saa hvis en opskrift flyttes til en anden kategori, ryddes den gamle kategori op hvis den er tom.

**Ny database-migrering:**

```text
CREATE TRIGGER trigger_cleanup_empty_categories_on_update
  AFTER UPDATE OF category_id ON public.bead_patterns
  FOR EACH ROW
  WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION public.cleanup_empty_categories();
```

Funktionen `cleanup_empty_categories()` eksisterer allerede og tjekker `OLD.category_id` - den virker ogsaa for UPDATE.

---

## 3. Adgangsstyring for knapperne

Nuvaerende logik:
- `canEdit = isAdmin || (user && user.id === pattern.user_id)` - viser rediger-knap
- `canDelete = isAdmin` - vises kun for admin

Ny logik:
- `canManage = isAdmin || (user && user.id === pattern.user_id)` - viser baade "Ret meta" og "Rediger opskrift"
- `canDelete = isAdmin` - forbliver kun for admin
- Ikke-logget-ind: ingen af de tre knapper vises

---

## 4. Fjern "Kategori:" teksten

I `CategoryFilter.tsx` fjernes linjen:
```text
<span className="text-sm font-medium text-muted-foreground mr-1">Kategori:</span>
```

---

## Filer der aendres

| Fil | AEndring |
|-----|---------|
| `src/components/gallery/PatternCard.tsx` | Ikon-knapper, ny metadata-dialog, adgangsstyring |
| `src/components/gallery/CategoryFilter.tsx` | Fjern "Kategori:" tekst |
| Database-migrering | Ny trigger paa UPDATE for kategori-oprydning |

---

## Tekniske detaljer

### PatternCard.tsx - Ny metadata-dialog

Ny state og imports:

```text
import { Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Ny state
const [metaDialogOpen, setMetaDialogOpen] = useState(false);
const [editTitle, setEditTitle] = useState(pattern.title);
const [editCategoryId, setEditCategoryId] = useState(pattern.category_id);
const [categories, setCategories] = useState([]);
const [newCategoryName, setNewCategoryName] = useState('');
const [isSavingMeta, setIsSavingMeta] = useState(false);
```

Funktioner:

```text
const fetchCategories = async () => {
  const { data } = await supabase.from('categories').select('id, name').order('name');
  setCategories(data || []);
};

const handleOpenMetaDialog = () => {
  setEditTitle(pattern.title);
  setEditCategoryId(pattern.category_id);
  setNewCategoryName('');
  fetchCategories();
  setMetaDialogOpen(true);
};

const handleSaveMeta = async () => {
  setIsSavingMeta(true);
  let categoryId = editCategoryId;

  // Opret ny kategori hvis valgt
  if (newCategoryName.trim()) {
    const { data } = await supabase
      .from('categories')
      .insert({ name: newCategoryName.trim() })
      .select('id')
      .single();
    if (data) categoryId = data.id;
  }

  const { error } = await supabase
    .from('bead_patterns')
    .update({ title: editTitle, category_id: categoryId })
    .eq('id', pattern.id);

  if (error) {
    toast.error('Kunne ikke opdatere opskriften');
  } else {
    toast.success('Opskrift opdateret');
    setMetaDialogOpen(false);
    onDelete?.(); // Genindlaes listen
  }
  setIsSavingMeta(false);
};
```

### PatternCard.tsx - Footer layout

```text
<CardFooter className="flex justify-between gap-1 pt-2">
  {/* Venstre: brugerknapper */}
  <div className="flex gap-1">
    <Button size="sm" onClick={onOpen} className="h-7 w-7 p-0" title="Aaben opskrift">
      <Eye className="h-3.5 w-3.5" />
    </Button>
    <AlertDialog>...
      <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Nulstil progress">
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </AlertDialog>
    <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Download PDF" ...>
      <FileDown className="h-3.5 w-3.5" /> eller <Loader2 .../>
    </Button>
  </div>

  {/* Hoejre: admin/ejer-knapper */}
  {canManage && (
    <div className="flex gap-1">
      <Button size="sm" variant="secondary" onClick={handleOpenMetaDialog} className="h-7 w-7 p-0" title="Ret metadata">
        <Settings2 className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="secondary" onClick={handleEdit} className="h-7 w-7 p-0" title="Rediger opskrift">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {canDelete && (
        <AlertDialog>...slet...</AlertDialog>
      )}
    </div>
  )}
</CardFooter>
```

### Metadata dialog UI

```text
<Dialog open={metaDialogOpen} onOpenChange={setMetaDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Ret metadata</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Titel</Label>
        <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Kategori</Label>
        <Select value={editCategoryId || ''} onValueChange={v => {
          setEditCategoryId(v || null);
          setNewCategoryName('');
        }}>
          <SelectTrigger><SelectValue placeholder="Vaelg kategori" /></SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Eller opret ny kategori</Label>
        <Input
          placeholder="Ny kategori..."
          value={newCategoryName}
          onChange={e => {
            setNewCategoryName(e.target.value);
            if (e.target.value) setEditCategoryId(null);
          }}
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setMetaDialogOpen(false)}>Annuller</Button>
      <Button onClick={handleSaveMeta} disabled={isSavingMeta || !editTitle.trim()}>
        {isSavingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gem'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### CategoryFilter.tsx

Fjern linje 49:
```text
<span className="text-sm font-medium text-muted-foreground mr-1">Kategori:</span>
```

### Database-migrering

```text
-- Trigger to cleanup empty categories when pattern category is changed
CREATE TRIGGER trigger_cleanup_empty_categories_on_update
  AFTER UPDATE OF category_id ON public.bead_patterns
  FOR EACH ROW
  WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION public.cleanup_empty_categories();
```

Genbruger den eksisterende `cleanup_empty_categories()`-funktion som allerede refererer til `OLD.category_id`.

