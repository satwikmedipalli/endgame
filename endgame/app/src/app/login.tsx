import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { DoneButton, Serif, T } from '@/components/ui';
import { useAuth } from '@/store/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

export default function Login() {
  const { t } = useTheme();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.btnLine,
    backgroundColor: t.card,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 17,
    color: t.text,
  } as const;

  const ok = email.includes('@') && password.length >= 8;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const err = await (mode === 'in' ? signIn : signUp)(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', paddingHorizontal: 32, gap: 28 }}>
      <View style={{ gap: 8 }}>
        <Serif italic size={44}>
          Endgame
        </Serif>
        <T size={16} color={t.muted} style={{ lineHeight: 24 }}>
          {mode === 'in' ? 'Sign in once. You stay signed in after that.' : 'Create your account. This only works once; signups close after.'}
        </T>
      </View>

      <View style={{ gap: 12 }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={t.faint}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          accessibilityLabel="Email"
          style={input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'up' ? 'Password (8+ characters)' : 'Password'}
          placeholderTextColor={t.faint}
          secureTextEntry
          autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          textContentType={mode === 'up' ? 'newPassword' : 'password'}
          accessibilityLabel="Password"
          onSubmitEditing={submit}
          style={input}
        />
      </View>

      {error && (
        <T size={14} color={t.text}>
          {error}
        </T>
      )}

      <View style={{ gap: 14 }}>
        {busy ? (
          <ActivityIndicator color={t.text} style={{ height: 50 }} />
        ) : (
          <DoneButton accessibilityLabel={mode === 'in' ? 'Sign in' : 'Create account'} disabled={!ok} onPress={submit} label={mode === 'in' ? 'SIGN IN' : 'CREATE ACCOUNT'} />
        )}
        <Pressable accessibilityRole="button" onPress={() => (setMode(mode === 'in' ? 'up' : 'in'), setError(null))} style={{ alignSelf: 'center', padding: 8 }}>
          <T size={14} color={t.muted}>
            {mode === 'in' ? 'First time? Create the account' : 'Already have it? Sign in'}
          </T>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
