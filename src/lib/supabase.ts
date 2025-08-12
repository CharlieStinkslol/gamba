import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Create a separate client for admin operations if service role key is available
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null
// Database types
export interface Profile {
  id: string;
  username: string;
  balance: number;
  is_admin: boolean;
  level: number;
  experience: number;
  last_daily_bonus: string | null;
  currency: 'USD' | 'GBP' | 'EUR' | 'BTC' | 'ETH' | 'LTC';
  created_at: string;
  updated_at: string;
}

export interface UserStats {
  id: string;
  user_id: string;
  total_bets: number;
  total_wins: number;
  total_losses: number;
  biggest_win: number;
  biggest_loss: number;
  total_wagered: number;
  total_won: number;
  created_at: string;
  updated_at: string;
}

export interface GameBet {
  id: string;
  user_id: string;
  game: 'Dice' | 'Limbo' | 'Crash' | 'Blackjack' | 'Plinko' | 'Spin Wheel';
  bet_amount: number;
  win_amount: number;
  multiplier: number;
  result: any;
  created_at: string;
}

export interface GameSetting {
  id: string;
  user_id: string;
  game_name: string;
  setting_name: string;
  settings: any;
  created_at: string;
  updated_at: string;
}

export interface Suggestion {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: 'feature' | 'bug' | 'improvement' | 'other';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'under-review' | 'planned' | 'in-progress' | 'completed' | 'rejected';
  upvotes: number;
  downvotes: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    username: string;
  };
  admin_responses?: Array<{
    id: string;
    response_text: string;
    created_at: string;
    profiles?: {
      username: string;
    };
  }>;
  user_vote?: {
    vote_type: 'up' | 'down';
  };
}

export interface SuggestionVote {
  id: string;
  suggestion_id: string;
  user_id: string;
  vote_type: 'up' | 'down';
  created_at: string;
}

export interface AdminResponse {
  id: string;
  suggestion_id: string;
  admin_id: string;
  response_text: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: 'daily' | 'gaming' | 'social' | 'special';
  reward: number;
  icon: string;
  cooldown_hours: number;
  max_progress: number;
  is_active: boolean;
  created_at: string;
}

export interface UserTaskProgress {
  id: string;
  user_id: string;
  task_id: string;
  progress: number;
  completed: boolean;
  last_completed: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminGameConfig {
  id: string;
  game_name: 'dice' | 'limbo' | 'crash' | 'blackjack' | 'plinko' | 'spin-wheel';
  enabled: boolean;
  min_bet: number;
  max_bet: number;
  house_edge: number;
  updated_by: string | null;
  updated_at: string;
}

// Supabase helper functions
export const supabaseHelpers = {
  // Profile functions
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    
    return data;
  },

  // Email/password authentication using Supabase Auth
  async authenticateUser(email: string, password: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .auth.signInWithPassword({
        email: email,
        password: password,
      });
    
    if (error || !data.user) {
      console.error('Authentication error:', error);
      return null;
    }
    
    // Get the user profile from our users table
    const profile = await this.getProfile(data.user.id);
    return profile;
  },

  // Email/password registration using Supabase Auth
  async registerUser(email: string, password: string, username: string): Promise<{ success: boolean; message: string; user?: Profile }> {
    const { data, error } = await supabase
      .auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username
          }
        }
      });
    
    if (error || !data.user) {
      console.error('Registration error:', error);
      return { success: false, message: error?.message || 'Registration failed' };
    }
    
    // Wait for the auth state to be established
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create profile directly in users table
    const newProfile: Omit<Profile, 'created_at' | 'updated_at'> = {
      id: data.user.id,
      username: username,
      email: email,
      balance: 1000,
      is_admin: false,
      level: 1,
      experience: 0,
      last_daily_bonus: null,
      currency: 'USD'
    };

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert([newProfile])
      .select()
      .single();
    
    if (profileError || !profile) {
      console.error('Profile creation error:', profileError);
      return { success: false, message: 'Failed to create user profile' };
    }
    
    // Create initial user stats
    const { error: statsError } = await supabase
      .from('user_stats')
      .insert([{
        user_id: data.user.id,
        total_bets: 0,
        total_wins: 0,
        total_losses: 0,
        total_wagered: 0,
        total_won: 0,
        biggest_win: 0,
        biggest_loss: 0
      }]);
    
    if (statsError) {
      console.error('Stats creation error:', statsError);
    }
    
    return { 
      success: true, 
      message: 'Registration successful',
      user: profile
    };
  },
  
  async updateProfile(userId: string, updates: Partial<Profile>): Promise<boolean> {
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);
    
    if (error) {
      console.error('Error updating profile:', error);
      return false;
    }
    
    return true;
  },

  // User stats functions
  async getUserStats(userId: string): Promise<UserStats | null> {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching user stats:', error);
      return null;
    }
    
    return data && data.length > 0 ? data[0] : null;
  },

  // Game bets functions
  async getUserBets(userId: string, limit = 100): Promise<GameBet[]> {
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching user bets:', error);
      return [];
    }
    
    return data || [];
  },

  async addBet(bet: Omit<GameBet, 'id' | 'created_at'>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('bets')
        .insert([bet]);
      
      if (error) {
        console.error('Error adding bet:', error);
        return false;
      }
      
      // Update user stats after adding bet
      const profit = bet.win_amount - bet.bet_amount;
      const isWin = profit > 0;
      
      const { error: statsError } = await supabase
        .from('user_stats')
        .upsert([{
          user_id: bet.user_id,
          total_bets: 1,
          total_wins: isWin ? 1 : 0,
          total_losses: isWin ? 0 : 1,
          total_wagered: bet.bet_amount,
          total_won: bet.win_amount,
          biggest_win: Math.max(0, profit),
          biggest_loss: Math.min(0, profit)
        }], {
          onConflict: 'user_id',
          ignoreDuplicates: false
        });
      
      if (statsError) {
        console.error('Error updating stats:', statsError);
      }
      
      return true;
    } catch (error) {
      console.error('Error adding bet:', error);
      return false;
    }
  },

  // Game settings functions
  async saveGameSettings(userId: string, gameName: string, settingName: string, settings: any): Promise<boolean> {
    const { error } = await supabase
      .from('game_settings')
      .upsert([{
        user_id: userId,
        game_name: gameName,
        setting_name: settingName,
        settings
      }]);
    
    if (error) {
      console.error('Error saving game settings:', error);
      return false;
    }
    
    return true;
  },

  async loadGameSettings(userId: string, gameName: string): Promise<any> {
    const { data, error } = await supabase
      .from('game_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('game_name', gameName);
    
    if (error) {
      console.error('Error loading game settings:', error);
      return {};
    }
    
    return data || [];
  },

  // Suggestions functions
  async getSuggestions(): Promise<Suggestion[]> {
    const { data, error } = await supabase
      .from('suggestions')
      .select(`
        *,
        users:user_id (username),
        admin_responses (
          id,
          response_text,
          created_at,
          users:admin_id (username)
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching suggestions:', error);
      return [];
    }
    
    return data || [];
  },

  async createSuggestion(suggestion: Omit<Suggestion, 'id' | 'created_at' | 'updated_at' | 'upvotes' | 'downvotes'>): Promise<boolean> {
    const { error } = await supabase
      .from('suggestions')
      .insert([suggestion]);
    
    if (error) {
      console.error('Error creating suggestion:', error);
      return false;
    }
    
    return true;
  },

  async voteSuggestion(userId: string, suggestionId: string, voteType: 'up' | 'down'): Promise<boolean> {
    const { error } = await supabase
      .from('suggestion_votes')
      .upsert([{
        user_id: userId,
        suggestion_id: suggestionId,
        vote_type: voteType
      }]);
    
    if (error) {
      console.error('Error voting on suggestion:', error);
      return false;
    }
    
    return true;
  },

  // Admin game config functions
  async getGameConfig(): Promise<AdminGameConfig[]> {
    const { data, error } = await supabase
      .from('admin_game_config')
      .select('*')
      .order('game_name');
    
    if (error) {
      console.error('Error fetching game config:', error);
      return [];
    }
    
    return data || [];
  },

  async updateGameConfig(gameConfig: Partial<AdminGameConfig> & { game_name: string }): Promise<boolean> {
    const { error } = await supabase
      .from('admin_game_config')
      .upsert([gameConfig]);
    
    if (error) {
      console.error('Error updating game config:', error);
      return false;
    }
    
    return true;
  }
};

// Legacy localStorage helpers for backward compatibility during migration
export const localStorage_helpers = {
  getUsers: (): Profile[] => {
    return JSON.parse(localStorage.getItem('charlies-odds-users') || '[]');
  },
  
  saveUsers: (users: Profile[]) => {
    localStorage.setItem('charlies-odds-users', JSON.stringify(users));
  },
  
  getUserStats: (): UserStats[] => {
    return JSON.parse(localStorage.getItem('charlies-odds-user-stats') || '[]');
  },
  
  saveUserStats: (stats: UserStats[]) => {
    localStorage.setItem('charlies-odds-user-stats', JSON.stringify(stats));
  },
  
  getBets: (): GameBet[] => {
    return JSON.parse(localStorage.getItem('charlies-odds-bets') || '[]');
  },
  
  saveBets: (bets: GameBet[]) => {
    localStorage.setItem('charlies-odds-bets', JSON.stringify(bets));
  },
  
  getSuggestions: (): Suggestion[] => {
    return JSON.parse(localStorage.getItem('charlies-odds-suggestions') || '[]');
  },
  
  saveSuggestions: (suggestions: Suggestion[]) => {
    localStorage.setItem('charlies-odds-suggestions', JSON.stringify(suggestions));
  },
  
  getGameConfig: (): AdminGameConfig[] => {
    return JSON.parse(localStorage.getItem('charlies-odds-game-config') || '[]');
  },
  
  saveGameConfig: (config: AdminGameConfig[]) => {
    localStorage.setItem('charlies-odds-game-config', JSON.stringify(config));
  }
};

// Initialize default data if not exists
export const initializeDefaultData = () => {
  // Initialize default game config
  const existingConfig = localStorage_helpers.getGameConfig();
  if (existingConfig.length === 0) {
    const defaultConfig: AdminGameConfig[] = [
      { id: '1', game_name: 'dice', enabled: true, min_bet: 0.01, max_bet: 1000, house_edge: 1, updated_by: null, updated_at: new Date().toISOString() },
      { id: '2', game_name: 'limbo', enabled: true, min_bet: 0.01, max_bet: 1000, house_edge: 1, updated_by: null, updated_at: new Date().toISOString() },
      { id: '3', game_name: 'crash', enabled: true, min_bet: 0.01, max_bet: 1000, house_edge: 1, updated_by: null, updated_at: new Date().toISOString() },
      { id: '4', game_name: 'blackjack', enabled: true, min_bet: 0.01, max_bet: 1000, house_edge: 0.5, updated_by: null, updated_at: new Date().toISOString() },
      { id: '5', game_name: 'plinko', enabled: true, min_bet: 0.01, max_bet: 1000, house_edge: 2, updated_by: null, updated_at: new Date().toISOString() },
      { id: '6', game_name: 'spin-wheel', enabled: true, min_bet: 0.01, max_bet: 1000, house_edge: 5, updated_by: null, updated_at: new Date().toISOString() }
    ];
    localStorage_helpers.saveGameConfig(defaultConfig);
  }
};

// Call initialization
initializeDefaultData();