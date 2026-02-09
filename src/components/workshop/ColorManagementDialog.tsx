import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

interface BeadColor {
  id: string;
  code: string;
  name: string;
  hex_color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface LocalColor extends BeadColor {
  _isNew?: boolean;
  _isModified?: boolean;
  _isDeleted?: boolean;
}

interface ColorManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ColorManagementDialog: React.FC<ColorManagementDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalColors, setOriginalColors] = useState<BeadColor[]>([]);
  const [colors, setColors] = useState<LocalColor[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ code: '', name: '', hex_color: '', is_active: true });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newColor, setNewColor] = useState({ code: '', name: '', hex_color: '#000000', is_active: true });

  const hasUnsavedChanges = useCallback(() => {
    return colors.some(c => c._isNew || c._isModified || c._isDeleted);
  }, [colors]);

  const fetchColors = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bead_colors')
      .select('*')
      .order('code');

    if (error) {
      toast({
        title: 'Fejl ved hentning af farver',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      const sorted = (data || []).sort((a, b) => parseInt(a.code) - parseInt(b.code));
      setOriginalColors(sorted);
      setColors(sorted.map(c => ({ ...c })));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchColors();
      setEditingId(null);
      setIsAddingNew(false);
    }
  }, [open, fetchColors]);

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      setShowUnsavedWarning(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleForceClose = () => {
    setShowUnsavedWarning(false);
    setColors(originalColors.map(c => ({ ...c })));
    onOpenChange(false);
  };

  const startEditing = (color: LocalColor) => {
    setEditingId(color.id);
    setEditForm({
      code: color.code,
      name: color.name,
      hex_color: color.hex_color,
      is_active: color.is_active,
    });
    setIsAddingNew(false);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({ code: '', name: '', hex_color: '', is_active: true });
  };

  const saveEditing = () => {
    if (!editForm.code.trim() || !editForm.name.trim() || !editForm.hex_color.trim()) {
      toast({
        title: 'Validering fejlede',
        description: 'Alle felter skal udfyldes',
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate codes
    const duplicateCode = colors.find(
      c => c.code === editForm.code.trim() && c.id !== editingId && !c._isDeleted
    );
    if (duplicateCode) {
      toast({
        title: 'Duplikat kode',
        description: `Koden "${editForm.code}" bruges allerede`,
        variant: 'destructive',
      });
      return;
    }

    setColors(prev =>
      prev.map(c => {
        if (c.id === editingId) {
          const original = originalColors.find(oc => oc.id === c.id);
          const isModified = original
            ? original.code !== editForm.code.trim() ||
              original.name !== editForm.name.trim() ||
              original.hex_color !== editForm.hex_color.trim() ||
              original.is_active !== editForm.is_active
            : true;

          return {
            ...c,
            code: editForm.code.trim(),
            name: editForm.name.trim(),
            hex_color: editForm.hex_color.trim(),
            is_active: editForm.is_active,
            _isModified: isModified && !c._isNew,
          };
        }
        return c;
      })
    );
    setEditingId(null);
  };

  const toggleActive = (id: string) => {
    setColors(prev =>
      prev.map(c => {
        if (c.id === id) {
          const original = originalColors.find(oc => oc.id === c.id);
          const newIsActive = !c.is_active;
          const isModified = original ? original.is_active !== newIsActive : true;
          return { ...c, is_active: newIsActive, _isModified: isModified && !c._isNew };
        }
        return c;
      })
    );
  };

  const markForDeletion = (id: string) => {
    setColors(prev =>
      prev.map(c => (c.id === id ? { ...c, _isDeleted: true } : c))
    );
    setDeleteConfirmId(null);
  };

  const addNewColor = () => {
    if (!newColor.code.trim() || !newColor.name.trim() || !newColor.hex_color.trim()) {
      toast({
        title: 'Validering fejlede',
        description: 'Alle felter skal udfyldes',
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate codes
    const duplicateCode = colors.find(
      c => c.code === newColor.code.trim() && !c._isDeleted
    );
    if (duplicateCode) {
      toast({
        title: 'Duplikat kode',
        description: `Koden "${newColor.code}" bruges allerede`,
        variant: 'destructive',
      });
      return;
    }

    const tempId = `new-${Date.now()}`;
    setColors(prev => [
      ...prev,
      {
        id: tempId,
        code: newColor.code.trim(),
        name: newColor.name.trim(),
        hex_color: newColor.hex_color.trim(),
        is_active: newColor.is_active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _isNew: true,
      },
    ]);
    setNewColor({ code: '', name: '', hex_color: '#000000', is_active: true });
    setIsAddingNew(false);
  };

  const saveAllChanges = async () => {
    setSaving(true);

    try {
      // Get changes
      const toInsert = colors.filter(c => c._isNew && !c._isDeleted);
      const toUpdate = colors.filter(c => c._isModified && !c._isNew && !c._isDeleted);
      const toDelete = colors.filter(c => c._isDeleted && !c._isNew);

      // Perform deletions
      for (const color of toDelete) {
        const { error } = await supabase.from('bead_colors').delete().eq('id', color.id);
        if (error) throw error;
      }

      // Perform updates
      for (const color of toUpdate) {
        const { error } = await supabase
          .from('bead_colors')
          .update({
            code: color.code,
            name: color.name,
            hex_color: color.hex_color,
            is_active: color.is_active,
          })
          .eq('id', color.id);
        if (error) throw error;
      }

      // Perform inserts
      for (const color of toInsert) {
        const { error } = await supabase.from('bead_colors').insert({
          code: color.code,
          name: color.name,
          hex_color: color.hex_color,
          is_active: color.is_active,
        });
        if (error) throw error;
      }

      toast({
        title: 'Farver gemt',
        description: `${toInsert.length} tilføjet, ${toUpdate.length} opdateret, ${toDelete.length} slettet`,
      });

      // Refresh data
      await fetchColors();
    } catch (error: any) {
      toast({
        title: 'Fejl ved gemning',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const visibleColors = colors.filter(c => !c._isDeleted);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Farve-administration</DialogTitle>
            <DialogDescription>
              Administrer dine perlefarver. Ændringer gemmes først når du trykker Gem.
              {hasUnsavedChanges() && (
                <span className="ml-2 text-orange-500 font-medium">
                  (Ugemte ændringer)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Farve</TableHead>
                      <TableHead className="w-20">Kode</TableHead>
                      <TableHead>Navn</TableHead>
                      <TableHead className="w-28">HEX</TableHead>
                      <TableHead className="w-20 text-center">Aktiv</TableHead>
                      <TableHead className="w-24 text-right">Handlinger</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleColors.map(color => (
                      <TableRow
                        key={color.id}
                        className={
                          color._isNew
                            ? 'bg-green-50 dark:bg-green-950/20'
                            : color._isModified
                            ? 'bg-yellow-50 dark:bg-yellow-950/20'
                            : ''
                        }
                      >
                        {editingId === color.id ? (
                          <>
                            <TableCell>
                              <div
                                className="w-8 h-8 rounded-full border border-border"
                                style={{ backgroundColor: editForm.hex_color }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editForm.code}
                                onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))}
                                className="h-8 w-16"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editForm.name}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 items-center">
                                <Input
                                  type="color"
                                  value={editForm.hex_color}
                                  onChange={e => setEditForm(f => ({ ...f, hex_color: e.target.value }))}
                                  className="h-8 w-10 p-0.5 cursor-pointer"
                                />
                                <Input
                                  value={editForm.hex_color}
                                  onChange={e => setEditForm(f => ({ ...f, hex_color: e.target.value }))}
                                  className="h-8 w-20 text-xs"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={editForm.is_active}
                                onCheckedChange={checked =>
                                  setEditForm(f => ({ ...f, is_active: checked }))
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" onClick={saveEditing}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={cancelEditing}>
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              <div
                                className="w-8 h-8 rounded-full border border-border"
                                style={{ backgroundColor: color.hex_color }}
                              />
                            </TableCell>
                            <TableCell className="font-mono">{color.code}</TableCell>
                            <TableCell>{color.name}</TableCell>
                            <TableCell className="font-mono text-sm">{color.hex_color}</TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={color.is_active}
                                onCheckedChange={() => toggleActive(color.id)}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => startEditing(color)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeleteConfirmId(color.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}

                    {/* Add new row */}
                    {isAddingNew && (
                      <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                        <TableCell>
                          <div
                            className="w-8 h-8 rounded-full border border-border"
                            style={{ backgroundColor: newColor.hex_color }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={newColor.code}
                            onChange={e => setNewColor(f => ({ ...f, code: e.target.value }))}
                            placeholder="01"
                            className="h-8 w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={newColor.name}
                            onChange={e => setNewColor(f => ({ ...f, name: e.target.value }))}
                            placeholder="Farvenavn"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 items-center">
                            <Input
                              type="color"
                              value={newColor.hex_color}
                              onChange={e => setNewColor(f => ({ ...f, hex_color: e.target.value }))}
                              className="h-8 w-10 p-0.5 cursor-pointer"
                            />
                            <Input
                              value={newColor.hex_color}
                              onChange={e => setNewColor(f => ({ ...f, hex_color: e.target.value }))}
                              className="h-8 w-20 text-xs"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={newColor.is_active}
                            onCheckedChange={checked =>
                              setNewColor(f => ({ ...f, is_active: checked }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" onClick={addNewColor}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setIsAddingNew(false);
                                setNewColor({ code: '', name: '', hex_color: '#000000', is_active: true });
                              }}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddingNew(true);
                setEditingId(null);
              }}
              disabled={isAddingNew || loading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Tilføj farve
            </Button>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Annuller
              </Button>
              <Button
                onClick={saveAllChanges}
                disabled={saving || !hasUnsavedChanges()}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Gem ændringer
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet farve?</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på, at du vil slette denne farve? Handlingen kan ikke fortrydes efter du
              gemmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && markForDeletion(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Slet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes warning */}
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ugemte ændringer</AlertDialogTitle>
            <AlertDialogDescription>
              Du har ændringer der ikke er gemt. Er du sikker på, at du vil lukke uden at gemme?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bliv her</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceClose}>Luk uden at gemme</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ColorManagementDialog;
