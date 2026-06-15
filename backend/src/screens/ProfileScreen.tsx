import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  auth,
  deleteAccountPermanently,
  fetchProfileForCurrentUser,
  logout,
  updateProfileForCurrentUser
} from "../firebase";
import { colors, styles as t } from "../theme";
import type { UserProfile } from "../types";

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const email = auth.currentUser?.email ?? "";

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const loaded = await fetchProfileForCurrentUser();
      if (loaded) {
        setProfile(loaded);
        setName(loaded.name ?? "");
        setPhone(loaded.phone ?? "");
        setAvatarUrl(loaded.avatarUrl ?? "");
      } else if (email) {
        setName(email.split("@")[0]);
      }
    } catch {
      // silent
    } finally {
      setInitializing(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8
    });

    if (!result.canceled && result.assets?.[0]) {
      setAvatarUrl(result.assets[0].uri);
      setMessage("");
    }
  };

  const removeAvatar = () => {
    setAvatarUrl("");
    setMessageType("success");
    setMessage("Avatar removed.");
    setTimeout(() => setMessage(""), 2000);
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch {
            Alert.alert("Error", "Failed to logout");
          }
        }
      }
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account permanently? This action cannot be undone and all your data will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await deleteAccountPermanently();
            } catch (error) {
              setLoading(false);
              Alert.alert("Error", error instanceof Error ? error.message : "Failed to delete account");
            }
          }
        }
      ]
    );
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      setMessageType("error");
      setMessage("Please enter your full name.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const nextProfile = await updateProfileForCurrentUser({
        email,
        name: name.trim(),
        phone: phone.trim(),
        avatarUrl: avatarUrl.trim()
      });
      setProfile(nextProfile);
      setMessageType("success");
      setMessage("Profile saved successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = profile?.role === "owner" ? "Owner" : "User";
  const displayName = name.trim() || profile?.name?.trim() || email.split("@")[0] || "User";
  const displayEmail = profile?.email || email || "Not set";
  const displayPhone = phone.trim() || profile?.phone || "-";
  const displayAvatarUrl = avatarUrl.trim() || profile?.avatarUrl?.trim() || "";
  const initials = displayName[0]?.toUpperCase() ?? "U";

  if (initializing) {
    return (
      <SafeAreaView style={t.screen}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={t.screen}>
      <ScrollView contentContainerStyle={t.content}>

        {/* Profile summary card */}
        <View style={t.card}>
          <View style={s.profileRow}>
            <View style={s.avatarCircle}>
              {displayAvatarUrl ? (
                <Image source={{ uri: displayAvatarUrl }} style={s.avatarImage} />
              ) : (
                <Text style={s.avatarInitials}>{initials}</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.roleLabel}>{roleLabel}</Text>
              <Text style={s.displayName} numberOfLines={1}>{displayName}</Text>
              <Text style={s.displayMeta} numberOfLines={1}>{displayEmail}</Text>
              <Text style={s.displayMeta}>{displayPhone}</Text>
            </View>
          </View>
        </View>

        {/* Edit Profile form card */}
        <View style={t.card}>
          <View style={s.formTitleRow}>
            <Text style={s.formTitle}>Edit Profile</Text>
            {profile && (
              <View style={s.savedBadge}>
                <Text style={s.savedBadgeText}>Saved</Text>
              </View>
            )}
          </View>

          {!!message && (
            <View style={[s.messageBanner, messageType === "success" ? s.messageBannerSuccess : s.messageBannerError]}>
              <Text style={messageType === "success" ? s.messageTextSuccess : s.messageTextError}>{message}</Text>
            </View>
          )}

          <View style={s.field}>
            <Text style={t.label}>Full Name <Text style={s.required}>*</Text></Text>
            <TextInput
              style={t.input}
              placeholder="Enter your full name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              editable={!loading}
              autoComplete="name"
            />
          </View>

          <View style={s.field}>
            <Text style={t.label}>Phone Number</Text>
            <TextInput
              style={t.input}
              placeholder="Enter your phone number"
              placeholderTextColor={colors.muted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
              autoComplete="tel"
            />
          </View>

          <View style={s.field}>
            <Text style={t.label}>Email Address</Text>
            <TextInput
              style={[t.input, s.inputDisabled]}
              value={email}
              editable={false}
            />
            <Text style={s.fieldNote}>Email changes are managed by Firebase and are not editable from this screen.</Text>
          </View>

          <View style={s.field}>
            <Text style={t.label}>Profile Avatar</Text>
            <Pressable style={t.outlineButton} onPress={pickImage} disabled={loading}>
              <Text style={t.outlineText}>Choose Image</Text>
            </Pressable>
            <Text style={s.fieldNote}>PNG, JPG, or GIF, up to 5MB</Text>
            {!!displayAvatarUrl && (
              <Pressable style={t.outlineButton} onPress={removeAvatar} disabled={loading}>
                <Text style={t.outlineText}>Remove Avatar</Text>
              </Pressable>
            )}
          </View>

          <View style={s.actionRow}>
            <Pressable
              style={[t.button, { flex: 1 }, loading && { opacity: 0.5 }]}
              onPress={saveProfile}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={t.buttonText}>Save Profile</Text>
              }
            </Pressable>
            <Pressable
              style={[t.dangerButton, { flex: 1 }, loading && { opacity: 0.5 }]}
              onPress={handleDeleteAccount}
              disabled={loading}
            >
              <Text style={t.dangerText}>{loading ? "Deleting..." : "Delete Account"}</Text>
            </Pressable>
          </View>

          <Pressable style={t.outlineButton} onPress={handleLogout}>
            <Text style={t.outlineText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  avatarCircle: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 28,
    flexShrink: 0,
    height: 56,
    justifyContent: "center",
    overflow: "hidden",
    width: 56
  },
  avatarImage: {
    height: 56,
    width: 56
  },
  avatarInitials: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700"
  },
  roleLabel: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  displayName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 2
  },
  displayMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 1
  },
  formTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  formTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700"
  },
  savedBadge: {
    backgroundColor: "#f0fdf4",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  savedBadgeText: {
    color: "#16a34a",
    fontSize: 12,
    fontWeight: "600"
  },
  messageBanner: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  messageBannerSuccess: {
    backgroundColor: "#ecfdf5"
  },
  messageBannerError: {
    backgroundColor: "#fef2f2"
  },
  messageTextSuccess: {
    color: "#047857",
    fontSize: 13
  },
  messageTextError: {
    color: "#b91c1c",
    fontSize: 13
  },
  field: { gap: 6 },
  required: { color: "#ef4444" },
  fieldNote: {
    color: colors.muted,
    fontSize: 12
  },
  inputDisabled: {
    backgroundColor: "#f5f5f5",
    color: colors.muted
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  }
});
