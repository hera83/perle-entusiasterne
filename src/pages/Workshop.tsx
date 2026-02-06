import React, { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Plus, Palette } from 'lucide-react';
import { ColorManagementDialog } from '@/components/workshop/ColorManagementDialog';
import { CreatePatternDialog } from '@/components/workshop/CreatePatternDialog';
import { PatternEditor } from '@/components/workshop/PatternEditor';

export const Workshop: React.FC = () => {
  const { user, loading } = useAuth();
  const { patternId } = useParams<{ patternId: string }>();
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [createPatternDialogOpen, setCreatePatternDialogOpen] = useState(false);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If we have a patternId, show the editor
  if (patternId) {
    return <PatternEditor />;
  }

  return (
    <Layout>
      <div className="container px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Wrench className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">WorkShop</h1>
            <p className="text-muted-foreground">
              Design og opret nye perleplade-opskrifter
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Import billede */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <Upload className="h-12 w-12 text-primary mb-2" />
              <CardTitle>Importer billede</CardTitle>
              <CardDescription>
                Upload et billede og konverter det automatisk til en perleplade-opskrift.
                Du kan fjerne baggrund og beskære billedet først.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                <Upload className="h-4 w-4 mr-2" />
                Vælg billede
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Kommer snart
              </p>
            </CardContent>
          </Card>

          {/* Ny opskrift */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <Plus className="h-12 w-12 text-primary mb-2" />
              <CardTitle>Ny opskrift</CardTitle>
              <CardDescription>
                Start fra bunden og tegn din egen perleplade-opskrift.
                Vælg antal plader i bredde og højde.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full"
                onClick={() => setCreatePatternDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Opret ny
              </Button>
            </CardContent>
          </Card>

          {/* Farve-administration */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <Palette className="h-12 w-12 text-primary mb-2" />
              <CardTitle>Farve-administration</CardTitle>
              <CardDescription>
                Administrer dine perlefarver. Tilføj nye farver, 
                rediger eksisterende eller deaktiver farver.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setColorDialogOpen(true)}
              >
                <Palette className="h-4 w-4 mr-2" />
                Åben farver
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Info section */}
        <div className="mt-12 p-6 bg-muted rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Sådan bruger du WorkShoppen</h2>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>
              <strong>Importer billede:</strong> Upload et billede og lad systemet konvertere det til perler.
              Du kan vælge antal plader og justere dimensionerne.
            </li>
            <li>
              <strong>Ny opskrift:</strong> Start med et tomt lærred og tegn din egen opskrift.
              Perfekt til at skabe unikke designs.
            </li>
            <li>
              <strong>Farve-administration:</strong> Se og administrer alle tilgængelige perlefarver.
              Du kan aktivere/deaktivere farver efter behov.
            </li>
          </ol>
        </div>

        <ColorManagementDialog 
          open={colorDialogOpen} 
          onOpenChange={setColorDialogOpen} 
        />

        <CreatePatternDialog
          open={createPatternDialogOpen}
          onOpenChange={setCreatePatternDialogOpen}
        />
      </div>
    </Layout>
  );
};

export default Workshop;
