import {
    type ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

import pb from "./pb";

export type Circle = {
    id: string;
    name: string;
    description: string;
    // file filename ("" when unset)
    image: string;
};

export type User = {
    id: string;
    user_name: string;
    // file filename ("" when unset); the URL comes from pb.files.getURL
    tou_xiang: string;
    // relation id ("" when unset); the record comes from `expand.circle`
    circle: string;
    expand?: {
        circle?: Circle;
    };
};

export type AuthContextType = {
    isAuthenticated: boolean;
    user: User;
    login: (credentials: {
        email: string;
        password: string;
    }) => Promise<{ error: { message: string } | null }>;
    logout: () => Promise<void>;
    loading: boolean;
    refresh: () => void;
};

const login = async (credentials: { email: string; password: string }) => {
    try {
        await pb
            .collection("users")
            .authWithPassword(credentials.email, credentials.password);
        return { error: null };
    } catch (error) {
        return { error: error as { message: string } };
    }
};

const logout = async () => {
    pb.authStore.clear();
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (ctx === null)
        throw new Error("useAuth can only be used in AuthProvider");

    return ctx;
}

const fetchUser = async (id: string): Promise<User | null> => {
    // `pb.authStore.record` has no expand, so fetch the profile with the
    // expanded circle for the avatar / circle rendering.
    try {
        const record = await pb.collection("users").getOne(id, {
            expand: "circle",
        });
        return record as unknown as User;
    } catch (error) {
        console.log("Failed to fetch the user profile", error);
        return null;
    }
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const isAuthenticated = user !== null;

    const loadUser = useCallback(async () => {
        const record = pb.authStore.record as User | null;
        if (!pb.authStore.isValid || !record?.id) {
            setUser(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await fetchUser(record.id);
            setUser(data);
        } finally {
            setLoading(false);
        }
    }, []);

    const refresh = useCallback(() => {
        loadUser();
    }, [loadUser]);

    useEffect(() => {
        loadUser();
        // Session restore and login/logout both flow through the auth store.
        return pb.authStore.onChange(() => {
            loadUser();
        });
    }, [loadUser]);

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
