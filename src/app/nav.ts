import { LayoutDashboard, BookOpen, BookA, Layers, ListChecks, Timer, Workflow, Target, BarChart3, CalendarDays, Settings, Bot, Library } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, key: 'd' },
  { to: '/learn', label: 'Learning Curriculum', icon: BookOpen, key: 'l' },
  { to: '/dictionary', label: 'Insurance Dictionary', icon: BookA, key: 'g' },
  { to: '/flashcards', label: 'Flashcards', icon: Layers, key: 'f' },
  { to: '/practice', label: 'Practice Questions', icon: ListChecks, key: 'p' },
  { to: '/exam', label: 'Mock Examinations', icon: Timer, key: 'e' },
  { to: '/scenarios', label: 'Scenario Simulator', icon: Workflow, key: 's' },
  { to: '/review', label: 'Weakness Review', icon: Target, key: 'w' },
  { to: '/analytics', label: 'Learning Analytics', icon: BarChart3, key: 'a' },
  { to: '/planner', label: 'Study Planner', icon: CalendarDays, key: 'c' },
  { to: '/tutor', label: 'AI Tutor (optional)', icon: Bot, key: 't' },
  { to: '/content', label: 'Content & Coverage', icon: Library, key: 'o' },
  { to: '/settings', label: 'Settings', icon: Settings, key: ',' },
] as const;
