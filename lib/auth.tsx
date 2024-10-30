// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import {
    type ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import type { AuthTokenResponsePassword } from "@supabase/supabase-js";

import supabase from "./supabase-client";

export type User = {
    id: string;
    user_name: string;
    tou_xiang: string;
    circle: string;
};

export type AuthContextType = {
    isAuthenticated: boolean;
    user: User;
    login: (credentials: {
        email: string;
        password: string;
    }) => Promise<AuthTokenResponsePassword>;
    logout: () => Promise<void>;
    loading: boolean;
    refresh: () => void;
};

const login = (credentials: { email: string; password: string }) => {
    return supabase.auth.signInWithPassword(credentials);
};

const logout = async () => {
    await supabase.auth.signOut();
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (ctx === null)
        throw new Error("useAuth can only be used in AuthProvider");

    return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const isAuthenticated = user !== null;

    const refresh = useCallback(() => {
        setLoading(true);
        fetchUser()
            .then((data) => {
                setUser(data);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        let mounted = true;
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT") {
                setUser(null);
            } else {
                (async () => {
                    setLoading(true);
                    const data = await fetchUser();
                    if (mounted) {
                        setUser(data);
                        setLoading(false);
                    }
                })();
            }
            console.log(event);
        });
        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                // @ts-expect-error errr
                user,
                login,
                logout,
                loading,
                refresh,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

const fetchUser = async () => {
    console.log("=============run fetch user");
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.auth.getUser();

    if (!data.user?.email || error) {
        return null;
    }

    const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id,user_name,tou_xiang,tou-xiang-circle(url)")
        .eq("id", data.user.id)
        .single();

    if (userError) return null;

    return {
        id: userData.id,
        user_name: userData.user_name,
        tou_xiang: userData.tou_xiang,
        circle: userData["tou-xiang-circle"]?.url,
    } as User;
};
