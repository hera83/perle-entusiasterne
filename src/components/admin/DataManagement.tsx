import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { db } from '@/services/db';
import { toast } from 'sonner';
import { Download, Upload, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

export const DataManagement: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch all data
      const { data: patterns } = await db.from('bead_patterns').select('*');
      const { data: plates } = await db.from('bead_plates').select('*');
      const { data: colors } = await db.from('bead_colors').select('*');
      const { data: categories } = await db.from('categories').select('*');

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        data: {
          patterns,
          plates,
          colors,
          categories,
        },
      };

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `perle-entusiasterne-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Data eksporteret');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Kunne ikke eksportere data');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.data) {
        toast.error('Ugyldig fil-format');
        return;
      }

      // Delete existing colors so we can replace with source IDs
      // (local seed colors have different UUIDs than the source system)
      if (importData.data.colors?.length) {
        await db.from('bead_colors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        for (const color of importData.data.colors) {
          const { error } = await db
            .from('bead_colors')
            .upsert(color, { onConflict: 'id' });
          if (error) console.error('Color import error:', error, color.code);
        }
      }

      // Import categories (preserve original IDs)
      if (importData.data.categories?.length) {
        for (const category of importData.data.categories) {
          await db
            .from('categories')
            .upsert(category, { onConflict: 'id' });
        }
      }

      // Import patterns
      if (importData.data.patterns?.length) {
        for (const pattern of importData.data.patterns) {
          const { error } = await db
            .from('bead_patterns')
            .upsert(pattern, { onConflict: 'id' });
          if (error) console.error('Pattern import error:', error, pattern.id);
        }
      }

      // Import plates (after patterns, since they reference pattern_id)
      if (importData.data.plates?.length) {
        for (const plate of importData.data.plates) {
          const { error } = await db
            .from('bead_plates')
            .upsert(plate, { onConflict: 'id' });
          if (error) console.error('Plate import error:', error, plate.id);
        }
      }

      toast.success('Data importeret');
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Kunne ikke importere data');
    }

    // Reset input
    e.target.value = '';
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      // Delete all user data in order
      await db.from('user_progress').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('user_favorites').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('bead_plates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('bead_patterns').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('announcements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await db.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      toast.success('Alt data er nulstillet');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Kunne ikke nulstille data');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Eksporter data</CardTitle>
          <CardDescription>
            Download en sikkerhedskopi af alle opskrifter, farver og kategorier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Eksporter JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importer data</CardTitle>
          <CardDescription>
            Gendan data fra en tidligere eksport. Eksisterende data vil blive opdateret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label>
            <Button asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                Vælg fil
              </span>
            </Button>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Nulstil alt data
          </CardTitle>
          <CardDescription>
            Slet alle opskrifter, kategorier, favoritter og progress. 
            Farver og brugere bevares. Denne handling kan IKKE fortrydes!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={resetting}>
                {resetting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Nulstil alt data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Er du helt sikker?</AlertDialogTitle>
                <AlertDialogDescription>
                  Dette vil permanent slette alle opskrifter, kategorier, 
                  favoritter og bruger-progress. Denne handling kan IKKE fortrydes!
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuller</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} className="bg-destructive">
                  Ja, slet alt
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};
