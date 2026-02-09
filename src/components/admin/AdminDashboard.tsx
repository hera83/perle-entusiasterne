import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Users, FolderOpen, PlayCircle, Download } from 'lucide-react';

interface DashboardStats {
  totalPatterns: number;
  publicPatterns: number;
  privatePatterns: number;
  totalCategories: number;
  totalUsers: number;
  startedPatterns: number;
  totalDownloads: number;
}

interface TopDownload {
  pattern_id: string;
  title: string;
  download_count: number;
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalPatterns: 0,
    publicPatterns: 0,
    privatePatterns: 0,
    totalCategories: 0,
    totalUsers: 0,
    startedPatterns: 0,
    totalDownloads: 0,
  });
  const [topDownloads, setTopDownloads] = useState<TopDownload[]>([]);
  const [topDownloadsMonth, setTopDownloadsMonth] = useState<TopDownload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchTopDownloads();
    fetchTopDownloadsMonth();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_stats');

      if (error) {
        console.error('Error fetching admin stats:', error);
        return;
      }

      if (data) {
        const statsData = data as Record<string, number>;
        setStats({
          totalPatterns: statsData.total_patterns || 0,
          publicPatterns: statsData.public_patterns || 0,
          privatePatterns: statsData.private_patterns || 0,
          totalCategories: statsData.total_categories || 0,
          totalUsers: statsData.total_users || 0,
          startedPatterns: statsData.started_patterns || 0,
          totalDownloads: statsData.total_downloads || 0,
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopDownloads = async () => {
    try {
      const { data, error } = await supabase
        .from('pdf_downloads')
        .select('pattern_id, bead_patterns(title)')
        .order('downloaded_at', { ascending: false });

      if (error || !data) return;

      // Group by pattern_id and count
      const countMap = new Map<string, { title: string; count: number }>();
      for (const row of data) {
        const pid = row.pattern_id;
        const title = (row.bead_patterns as any)?.title || 'Ukendt';
        const existing = countMap.get(pid);
        if (existing) {
          existing.count++;
        } else {
          countMap.set(pid, { title, count: 1 });
        }
      }

      const sorted = Array.from(countMap.entries())
        .map(([pattern_id, { title, count }]) => ({ pattern_id, title, download_count: count }))
        .sort((a, b) => b.download_count - a.download_count)
        .slice(0, 10);

      setTopDownloads(sorted);
    } catch (err) {
      console.error('Error fetching top downloads:', err);
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
    {
      title: 'PDF Downloads',
      value: stats.totalDownloads,
      description: 'Totalt antal downloads',
      icon: Download,
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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

      {topDownloads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 mest downloadede opskrifter</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Opskrift</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topDownloads.map((item, index) => (
                  <TableRow key={item.pattern_id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell className="text-right">{item.download_count.toLocaleString('da-DK')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
