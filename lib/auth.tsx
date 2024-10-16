import { loginFn } from "@/app/routes/_protected/login";
import { logoutFn } from "@/app/routes/logout";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import supabase from "./supabase-client";

type User = {
	id: string;
	user_name: string;
	tou_xiang: string;
	circle: string;
};

export interface AuthContext {
	isAuthenticated: boolean;
	login: (email: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
	user: User | null;
}
const AuthContext = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const isAuthenticated = !!user;

	const logout = useCallback(async () => {
		await logoutFn();
		setUser(null);
	}, []);

	const login = useCallback(async (email: string, password: string) => {
		loginFn({ email, password });
	}, []);

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (event, session) => {
			console.log(event);
			switch (event) {
				case "SIGNED_IN": {
					if (session === null) {
						setUser(null);
						break;
					}

					const { data, error } = await supabase
						.from("users")
						.select("id,user_name,tou_xiang,tou-xiang-circle(url)")
						.eq("id", session.user.id)
						.single();
					if (error || !data) {
						setUser(null);
					} else {
						setUser({ ...data, circle: data["tou-xiang-circle"]?.url });
					}
					break;
				}
				case "SIGNED_OUT": {
					setUser(null);
					break;
				}
			}
		});

		return () => {
			subscription.unsubscribe();
		};
	}, []);

	return (
		<AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
