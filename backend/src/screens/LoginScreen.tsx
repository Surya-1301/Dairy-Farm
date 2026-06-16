import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  signIn,
  signUp,
  resetPassword
} from "../firebase";
import { generateOtp, OTP_VALIDITY_MS, sendEmailOtp } from "../utils/emailOtp";
import { colors } from "../theme";

const logo = require("../../assets/logo.png");

type AuthMode = "signin" | "signup" | "reset";

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize="none"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, multiline ? { minHeight: 92, textAlignVertical: "top" } : null]}
      />
    </View>
  );
}

function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "danger";
  disabled?: boolean;
}) {
  const buttonStyle = variant === "primary" ? styles.button : variant === "danger" ? styles.dangerButton : styles.outlineButton;
  const textStyle = variant === "primary" ? styles.buttonText : variant === "danger" ? styles.dangerText : styles.outlineText;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={[buttonStyle, disabled ? { opacity: 0.5 } : null]}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [pendingOtp, setPendingOtp] = useState("");
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Use your email address and password to access the app.");

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!otpSent) {
          if (password !== confirmPassword) throw new Error("Passwords do not match.");
          const code = generateOtp();
          await sendEmailOtp(email.trim(), name.trim(), code);
          setPendingOtp(code);
          setOtpExpiry(Date.now() + OTP_VALIDITY_MS);
          setOtpSent(true);
          setMessage(`Enter the 6-digit code sent to ${email.trim()}.`);
        } else {
          if (otpExpiry && Date.now() > otpExpiry) {
            setOtpSent(false);
            setPendingOtp("");
            setOtpInput("");
            throw new Error("Code expired. Tap Sign up to get a new one.");
          }
          if (otpInput.trim() !== pendingOtp) throw new Error("Incorrect code. Please try again.");
          await signUp(email, password, name, phone.trim());
        }
      } else if (mode === "reset") {
        await resetPassword(email);
        setMessage("Password reset email sent. Check your inbox and sign in.");
        setMode("signin");
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    try {
      const code = generateOtp();
      await sendEmailOtp(email.trim(), name.trim(), code);
      setPendingOtp(code);
      setOtpExpiry(Date.now() + OTP_VALIDITY_MS);
      setOtpInput("");
      setMessage(`New code sent to ${email.trim()}.`);
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setPhone("");
    setOtpSent(false);
    setOtpInput("");
    setPendingOtp("");
    setOtpExpiry(null);
    setMessage("Use your email address and password to access the app.");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: "center" }]}>
          <View style={[styles.card, { gap: 16 }]}>
            <View style={[styles.row, { gap: 12 }]}>
              <Image source={logo} style={styles.logo} />
              <View>
                <Text style={styles.title}>Dairy Farm</Text>
                <Text style={styles.subtitle}>Raipur Dairy Management</Text>
              </View>
            </View>

            <View style={styles.segment}>
              <Pressable style={[styles.segmentItem, mode === "signin" ? styles.segmentActive : null]} onPress={() => switchMode("signin")}>
                <Text style={styles.segmentText}>Sign in</Text>
              </Pressable>
              <Pressable style={[styles.segmentItem, mode === "signup" ? styles.segmentActive : null]} onPress={() => switchMode("signup")}>
                <Text style={styles.segmentText}>Sign up</Text>
              </Pressable>
            </View>

            <Text style={styles.subtitle}>{message}</Text>

            {mode === "signup" && otpSent ? (
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Verification Code</Text>
                <TextInput
                  value={otpInput}
                  onChangeText={(v) => setOtpInput(v.replace(/\D/g, ""))}
                  placeholder="000000"
                  keyboardType="numeric"
                  maxLength={6}
                  autoFocus
                  style={[styles.input, styles.otpInput]}
                />
              </View>
            ) : null}

            {mode === "signup" && !otpSent ? (
              <Field label="Full Name" value={name} onChangeText={setName} placeholder="Enter your name" />
            ) : null}
            {mode === "signup" && !otpSent ? (
              <Field label="Phone Number" value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" />
            ) : null}
            {!otpSent ? (
              <Field label="Email Address" value={email} onChangeText={setEmail} placeholder="Enter email" keyboardType="email-address" />
            ) : null}
            {mode !== "reset" && !otpSent ? (
              <Field label="Password" value={password} onChangeText={setPassword} placeholder="Enter password" secureTextEntry />
            ) : null}
            {mode === "signup" && !otpSent ? (
              <Field label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureTextEntry />
            ) : null}

            <Button
              label={
                loading
                  ? mode === "signin" ? "Signing in..." : mode === "signup" ? (otpSent ? "Verifying..." : "Sending code...") : "Sending reset link..."
                  : mode === "signin" ? "Sign in" : mode === "signup" ? (otpSent ? "Verify code" : "Sign up") : "Send reset link"
              }
              onPress={submit}
              disabled={loading}
            />
            {mode === "signup" && otpSent ? (
              <Button label="Resend code" onPress={handleResendOtp} variant="outline" disabled={loading} />
            ) : null}
            {mode === "signin" ? (
              <Button label="Forgot password?" onPress={() => switchMode("reset")} variant="outline" />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20
  },
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  logo: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 56,
    width: 56
  },
  title: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  segment: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  segmentItem: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    padding: 10
  },
  segmentActive: {
    backgroundColor: "#ffffff"
  },
  segmentText: {
    color: colors.foreground,
    fontWeight: "700"
  },
  fieldContainer: {
    gap: 8
  },
  label: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600"
  },
  input: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.foreground,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  otpInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center"
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  outlineButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12
  },
  outlineText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "700"
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingVertical: 12
  },
  dangerText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  }
});
