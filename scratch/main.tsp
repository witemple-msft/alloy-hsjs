import "@typespec/http";

@service(#{ title: "My Service" })
namespace MyService;

using TypeSpec.Http;

/**
 * Information about the service.
 */
model Info {
    /**
     * The message of the day.
     */
    motd: string;
}

model User {
    name: string;
}

@route("/hello")
interface Operations {
    @get info(): OkResponse & Info;
}

@route("/users")
interface Users {
    // @route("/users/{id}/settings")
    @get
    users(): User;
}
