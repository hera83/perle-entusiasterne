import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Users, FolderOpen, CheckCircle, PlayCircle } from 'lucide-react';

interface DashboardStats {
  totalPatterns: number;
  publicPatterns: number;
  privatePatterns: number;
  totalCategories: number;
  totalUsers: number;
  startedPatterns: number;
  completedPatterns: number;
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalPatterns: 0,
    publicPatterns: 0,
    privatePatterns: 0,
    totalCategories: 0,
    totalUsers: 0,
    startedPatterns: 0,
    completedPatterns: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch pattern counts
      const { count: totalPatterns } = await supabase
        .from('bead_patterns')
        .select('*', { count: 'exact', head: true });

      const { count: publicPatterns } = await supabase
        .from('bead_patterns')
        .select('*', { count: 'exact', head: true })
        .eq('is_public', true);

      const { count: privatePatterns } = await supabase
        .from('bead_patterns')
        .select('*', { count: 'exact', head: true })
        .eq('is_public', false);

      // Fetch category count
      const { count: totalCategories } = await supabase
        .from('categories')
        .select('*', { count: 'exact', head: true });

      // Fetch user count
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch progress stats
      const { count: startedPatterns } = await supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true });

      // Note: We'd need to calculate completed patterns based on progress data
      // For now, we'll just show started patterns

      setStats({
        totalPatterns: totalPatterns || 0,
        publicPatterns: publicPatterns || 0,
        privatePatterns: privatePatterns || 0,
        totalCategories: totalCategories || 0,
        totalUsers: totalUsers || 0,
        startedPatterns: startedPatterns || 0,
        completedPatterns: 0,
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total opskrifter',
      value: stats.totalPatterns,
      description: `${stats.publicPatterns} offentlige, ${stats.privatePatterns} private`,
      icon: FileText,
      color: 'text-primary',
    },
    {
      title: 'Kategorier',
      value: stats.totalCategories,
      description: 'Forskellige kategorier',
      icon: FolderOpen,
      color: 'text-purple-500',
    },
    {
      title: 'Brugere',
      value: stats.totalUsers,
      description: 'Registrerede brugere',
      icon: Users,
      color: 'text-blue-500',
    },
    {
      title: 'Startede opskrifter',
      value: stats.startedPatterns,
      description: 'Brugere har startet på',
      icon: PlayCircle,
      color: 'text-green-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {loading ? '-' : stat.value.toLocaleString('da-DK')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
